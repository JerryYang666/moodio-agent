import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, eq } from "drizzle-orm";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";
import { getUserSetting } from "@/lib/user-settings/server";
import {
  MAX_ELEMENT_IMAGES,
  MAX_NAME_LEN,
  MAX_DESCRIPTION_LEN,
  MAX_VOICE_ID_LEN,
  buildElementDetails,
  ksyunSourceFingerprint,
  parseStringArray,
  resolveDestinationPermission,
} from "@/lib/elements/helpers";

type ElementPatchBody = {
  name?: string;
  description?: string;
  imageIds?: string[];
  videoId?: string | null;
  voiceId?: string | null;
  /**
   * Optional. Only the server-side video-generate route writes this — clients
   * never need to set it. When provided, it's stored alongside a fingerprint
   * derived from the (post-update) imageIds so the next KSyun submission
   * skips create+poll while still invalidating after a content change.
   */
  ksyunElementId?: number | null;
};

async function loadElement(id: string) {
  const [row] = await db
    .select()
    .from(collectionImages)
    .where(
      and(
        eq(collectionImages.id, id),
        eq(collectionImages.assetType, "element")
      )
    )
    .limit(1);
  return row ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const userId = payload.userId;
    const { id } = await params;

    const existing = await loadElement(id);
    if (!existing) {
      return NextResponse.json({ error: "Element not found" }, { status: 404 });
    }

    const canWrite = await resolveDestinationPermission({
      userId,
      projectId: existing.projectId,
      collectionId: existing.collectionId,
      folderId: existing.folderId,
    });
    if (!canWrite) {
      return NextResponse.json(
        { error: "You don't have permission to edit this element" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as ElementPatchBody;
    const gen = (existing.generationDetails ?? {}) as {
      title?: unknown;
      prompt?: unknown;
      status?: unknown;
    };
    const currentDetails = (existing.elementDetails ?? {}) as {
      imageIds?: unknown;
      videoId?: unknown;
      voiceId?: unknown;
      ksyunElementId?: unknown;
      ksyunSourceFingerprint?: unknown;
    };

    const nextName =
      body.name !== undefined
        ? typeof body.name === "string"
          ? body.name.trim()
          : ""
        : typeof gen.title === "string"
          ? gen.title
          : "";
    if (body.name !== undefined) {
      if (!nextName || nextName.length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: "name must be 1–255 chars" },
          { status: 400 }
        );
      }
    }

    const nextDescription =
      body.description !== undefined
        ? typeof body.description === "string"
          ? body.description
          : ""
        : typeof gen.prompt === "string"
          ? gen.prompt
          : "";
    if (nextDescription.length > MAX_DESCRIPTION_LEN) {
      return NextResponse.json(
        { error: `description too long (max ${MAX_DESCRIPTION_LEN} chars)` },
        { status: 400 }
      );
    }

    let nextImageIds: string[];
    if (body.imageIds !== undefined) {
      const parsed = parseStringArray(body.imageIds, MAX_ELEMENT_IMAGES);
      if (parsed === null) {
        return NextResponse.json(
          {
            error: `imageIds must be an array of ≤${MAX_ELEMENT_IMAGES} strings`,
          },
          { status: 400 }
        );
      }
      nextImageIds = parsed;
    } else {
      nextImageIds = Array.isArray(currentDetails.imageIds)
        ? (currentDetails.imageIds as unknown[]).filter(
            (v): v is string => typeof v === "string"
          )
        : [];
    }

    let nextVideoId: string | null;
    if (body.videoId !== undefined) {
      nextVideoId =
        typeof body.videoId === "string" && body.videoId.trim()
          ? body.videoId.trim()
          : null;
    } else {
      nextVideoId =
        typeof currentDetails.videoId === "string"
          ? currentDetails.videoId
          : null;
    }

    let nextVoiceId: string | null;
    if (body.voiceId !== undefined) {
      nextVoiceId =
        typeof body.voiceId === "string" && body.voiceId.trim()
          ? body.voiceId.trim()
          : null;
      if (nextVoiceId && nextVoiceId.length > MAX_VOICE_ID_LEN) {
        return NextResponse.json(
          { error: "voiceId too long" },
          { status: 400 }
        );
      }
    } else {
      nextVoiceId =
        typeof currentDetails.voiceId === "string"
          ? currentDetails.voiceId
          : null;
    }

    const primaryImageId = nextImageIds[0] ?? "";

    // KSyun element id round-trip:
    // - If imageIds didn't change, preserve any existing id+fingerprint on the
    //   row (no need for the caller to know it).
    // - If the caller is explicitly writing a fresh id (server-side write-back),
    //   accept it and pin a fingerprint matching the just-saved imageIds.
    // - If imageIds changed and no new id is supplied, drop the stale id so
    //   the next submission re-creates against the new content.
    const imageIdsChanged =
      body.imageIds !== undefined &&
      JSON.stringify(
        Array.isArray(currentDetails.imageIds)
          ? (currentDetails.imageIds as unknown[]).filter(
              (v): v is string => typeof v === "string"
            )
          : []
      ) !== JSON.stringify(nextImageIds);

    let nextKsyunId: number | null;
    let nextKsyunFp: string | null;
    if (body.ksyunElementId !== undefined) {
      nextKsyunId =
        typeof body.ksyunElementId === "number" ? body.ksyunElementId : null;
      nextKsyunFp =
        nextKsyunId !== null ? ksyunSourceFingerprint(nextImageIds) : null;
    } else if (imageIdsChanged) {
      nextKsyunId = null;
      nextKsyunFp = null;
    } else {
      nextKsyunId =
        typeof currentDetails.ksyunElementId === "number"
          ? currentDetails.ksyunElementId
          : null;
      nextKsyunFp =
        typeof currentDetails.ksyunSourceFingerprint === "string"
          ? currentDetails.ksyunSourceFingerprint
          : null;
    }

    const nextGenerationDetails = {
      ...gen,
      title: nextName,
      prompt: nextDescription,
      status: typeof gen.status === "string" ? gen.status : "generated",
    };

    const [updated] = await db
      .update(collectionImages)
      .set({
        imageId: primaryImageId,
        assetId: primaryImageId,
        generationDetails: nextGenerationDetails,
        elementDetails: buildElementDetails({
          imageIds: nextImageIds,
          videoId: nextVideoId,
          voiceId: nextVoiceId,
          ksyunElementId: nextKsyunId,
          ksyunSourceFingerprint: nextKsyunFp,
        }),
      })
      .where(eq(collectionImages.id, id))
      .returning();

    const cnMode = await getUserSetting(userId, "cnMode");

    return NextResponse.json({
      asset: {
        ...updated,
        imageUrl: primaryImageId ? getImageUrl(primaryImageId, cnMode) : "",
        elementDetails: {
          id: updated.id,
          name: nextName,
          description: nextDescription,
          imageIds: nextImageIds,
          videoId: nextVideoId ?? undefined,
          voiceId: nextVoiceId ?? undefined,
          voiceProvider: nextVoiceId ? ("fal" as const) : undefined,
          ksyunElementId: nextKsyunId ?? undefined,
          ksyunSourceFingerprint: nextKsyunFp ?? undefined,
          imageUrls: nextImageIds.map((imgId) => getImageUrl(imgId, cnMode)),
          videoUrl: nextVideoId ? getVideoUrl(nextVideoId, cnMode) : undefined,
        },
      },
    });
  } catch (error) {
    console.error("Error updating element:", error);
    return NextResponse.json(
      { error: "Failed to update element" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const userId = payload.userId;
    const { id } = await params;

    const existing = await loadElement(id);
    if (!existing) {
      return NextResponse.json({ error: "Element not found" }, { status: 404 });
    }

    const canWrite = await resolveDestinationPermission({
      userId,
      projectId: existing.projectId,
      collectionId: existing.collectionId,
      folderId: existing.folderId,
    });
    if (!canWrite) {
      return NextResponse.json(
        { error: "You don't have permission to delete this element" },
        { status: 403 }
      );
    }

    // Element is a reference, not ownership — constituent images/videos remain
    // as their own assets. Only the element row is removed.
    await db
      .delete(collectionImages)
      .where(eq(collectionImages.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting element:", error);
    return NextResponse.json(
      { error: "Failed to delete element" },
      { status: 500 }
    );
  }
}
