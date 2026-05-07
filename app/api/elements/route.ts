import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";
import { ensureDefaultProject } from "@/lib/db/projects";
import { ensureDefaultElementsCollection } from "@/lib/db/elements-collection";
import { getUserSetting } from "@/lib/user-settings/server";
import {
  MAX_ELEMENT_IMAGES,
  MAX_NAME_LEN,
  MAX_DESCRIPTION_LEN,
  MAX_VOICE_ID_LEN,
  buildElementDetails,
  parseStringArray,
  resolveDestinationPermission,
  validateDestinationTuple,
} from "@/lib/elements/helpers";

type ElementCreateBody = {
  projectId?: string;
  collectionId?: string | null;
  folderId?: string | null;
  name: string;
  description?: string;
  imageIds?: string[];
  videoId?: string | null;
  voiceId?: string | null;
  /**
   * When true and projectId/collectionId are omitted, the server routes the
   * new element into the user's default project + default "My Elements"
   * collection. Used by the chat composer's "create element on the spot" flow.
   */
  useDefaultElementsCollection?: boolean;
};

/**
 * POST /api/elements
 * Create an aggregated "element" asset.
 *
 * Elements live in the same collection_images table as other assets, with
 * assetType='element' and a structured element_details JSONB column.
 * name/description are stored in generationDetails (title/prompt) so every
 * existing asset surface that reads generationDetails keeps working.
 */
export async function POST(req: NextRequest) {
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

    const body = (await req.json()) as ElementCreateBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: "name is required (1–255 chars)" },
        { status: 400 }
      );
    }
    const description =
      typeof body.description === "string" ? body.description : "";
    if (description.length > MAX_DESCRIPTION_LEN) {
      return NextResponse.json(
        { error: `description too long (max ${MAX_DESCRIPTION_LEN} chars)` },
        { status: 400 }
      );
    }

    const imageIds = parseStringArray(body.imageIds, MAX_ELEMENT_IMAGES);
    if (imageIds === null) {
      return NextResponse.json(
        { error: `imageIds must be an array of ≤${MAX_ELEMENT_IMAGES} strings` },
        { status: 400 }
      );
    }

    const videoId =
      typeof body.videoId === "string" && body.videoId.trim()
        ? body.videoId.trim()
        : null;

    const voiceId =
      typeof body.voiceId === "string" && body.voiceId.trim()
        ? body.voiceId.trim()
        : null;
    if (voiceId && voiceId.length > MAX_VOICE_ID_LEN) {
      return NextResponse.json(
        { error: "voiceId too long" },
        { status: 400 }
      );
    }

    const explicitProjectId =
      typeof body.projectId === "string" && body.projectId.trim()
        ? body.projectId.trim()
        : null;
    const explicitCollectionId =
      typeof body.collectionId === "string" && body.collectionId.trim()
        ? body.collectionId.trim()
        : null;
    const folderId =
      typeof body.folderId === "string" && body.folderId.trim()
        ? body.folderId.trim()
        : null;

    let resolvedProjectId: string;
    let collectionId: string | null;
    if (
      body.useDefaultElementsCollection &&
      !explicitProjectId &&
      !explicitCollectionId &&
      !folderId
    ) {
      const project = await ensureDefaultProject(userId);
      const defaultColl = await ensureDefaultElementsCollection(
        userId,
        project.id
      );
      resolvedProjectId = project.id;
      collectionId = defaultColl.id;
    } else {
      resolvedProjectId =
        explicitProjectId ?? (await ensureDefaultProject(userId)).id;
      collectionId = explicitCollectionId;
    }

    const destCheck = await validateDestinationTuple({
      projectId: resolvedProjectId,
      collectionId,
      folderId,
    });
    if (!destCheck.ok) {
      return NextResponse.json(
        { error: destCheck.error },
        { status: destCheck.status }
      );
    }

    const canWrite = await resolveDestinationPermission({
      userId,
      projectId: resolvedProjectId,
      collectionId,
      folderId,
    });
    if (!canWrite) {
      return NextResponse.json(
        { error: "You don't have permission to create elements here" },
        { status: 403 }
      );
    }

    // The element itself still needs a stable imageId/assetId for legacy display
    // fallbacks. Use the first constituent image when present, else empty (the
    // varchar column allows empty strings; display code falls back to
    // element_details.imageIds).
    const primaryImageId = imageIds[0] ?? "";

    const [created] = await db
      .insert(collectionImages)
      .values({
        projectId: resolvedProjectId,
        collectionId,
        folderId,
        imageId: primaryImageId,
        assetId: primaryImageId,
        assetType: "element",
        chatId: null,
        generationDetails: {
          title: name,
          prompt: description,
          status: "generated",
        },
        elementDetails: buildElementDetails({ imageIds, videoId, voiceId }),
      })
      .returning();

    const cnMode = await getUserSetting(userId, "cnMode");
    const imageUrls = imageIds.map((id) => getImageUrl(id, cnMode));

    return NextResponse.json({
      asset: {
        ...created,
        imageUrl: primaryImageId ? getImageUrl(primaryImageId, cnMode) : "",
        elementDetails: {
          id: created.id,
          name,
          description,
          imageIds,
          videoId: videoId ?? undefined,
          voiceId: voiceId ?? undefined,
          voiceProvider: voiceId ? ("fal" as const) : undefined,
          ksyunElementId: undefined,
          ksyunSourceFingerprint: undefined,
          imageUrls,
          videoUrl: videoId ? getVideoUrl(videoId, cnMode) : undefined,
        },
      },
    });
  } catch (error) {
    console.error("Error creating element:", error);
    return NextResponse.json(
      { error: "Failed to create element" },
      { status: 500 }
    );
  }
}
