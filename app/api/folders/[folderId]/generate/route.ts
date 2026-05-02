import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages, folders } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getFolderPermission, touchFolder } from "@/lib/folder-utils";
import { hasWriteAccess } from "@/lib/permissions";
import {
  generateImageInGroup,
  type GroupImageGenerateInput,
} from "@/lib/groups/service";

/**
 * POST /api/folders/[folderId]/generate
 * Kick a new generation inside a group, optionally seeded with the config of
 * an existing member. Persists the resulting asset as a new member of the
 * group; if the group has no cover yet, the new asset becomes the cover.
 *
 * Image groups: synchronous. Body: { config: GroupImageGenerateInput,
 * copyFromImageId?: string }. Returns the new collection_images row.
 *
 * Video groups: this endpoint returns a hint — the client should call the
 * existing POST /api/video/generate with `targetFolderId: folderId` set on
 * the body so the webhook can attach the result back to this group.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
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
    const { folderId } = await params;

    const permission = await getFolderPermission(folderId, userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to generate in this group" },
        { status: 403 }
      );
    }

    const [folder] = await db
      .select({
        id: folders.id,
        modality: folders.modality,
        defaultGenerationConfig: folders.defaultGenerationConfig,
      })
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1);

    if (!folder) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (!folder.modality) {
      return NextResponse.json(
        { error: "This folder is not a group" },
        { status: 400 }
      );
    }

    if (folder.modality === "video") {
      // Video generation goes through the existing pipeline; the webhook
      // calls attachVideoToGroup when the row has targetFolderId set.
      return NextResponse.json(
        {
          error:
            "Video group generation must go through POST /api/video/generate with `targetFolderId` set on the body",
          modality: "video",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { config: configRaw, copyFromImageId, chatId } = body as {
      config?: Record<string, unknown>;
      copyFromImageId?: string;
      chatId?: string | null;
    };

    // Resolve the effective config: explicit config wins; otherwise inherit
    // from copyFromImageId's generationDetails; otherwise fall back to
    // defaultGenerationConfig.
    let resolvedConfig: Record<string, unknown> = {};

    if (copyFromImageId) {
      const [member] = await db
        .select({
          generationDetails: collectionImages.generationDetails,
        })
        .from(collectionImages)
        .where(
          and(
            eq(collectionImages.id, copyFromImageId),
            eq(collectionImages.folderId, folderId)
          )
        )
        .limit(1);
      if (!member) {
        return NextResponse.json(
          { error: "copyFromImageId is not a member of this group" },
          { status: 400 }
        );
      }
      resolvedConfig = {
        ...(member.generationDetails as Record<string, unknown>),
      };
    } else if (
      folder.defaultGenerationConfig &&
      typeof folder.defaultGenerationConfig === "object"
    ) {
      resolvedConfig = {
        ...(folder.defaultGenerationConfig as Record<string, unknown>),
      };
    }

    if (configRaw && typeof configRaw === "object") {
      resolvedConfig = { ...resolvedConfig, ...configRaw };
    }

    const prompt = resolvedConfig.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "config.prompt is required (string, non-empty)" },
        { status: 400 }
      );
    }

    const groupInput: GroupImageGenerateInput = {
      modelId:
        typeof resolvedConfig.modelId === "string"
          ? resolvedConfig.modelId
          : undefined,
      referenceImageIds: Array.isArray(resolvedConfig.referenceImageIds)
        ? (resolvedConfig.referenceImageIds as string[])
        : undefined,
      prompt: prompt.trim(),
      aspectRatio:
        typeof resolvedConfig.aspectRatio === "string"
          ? resolvedConfig.aspectRatio
          : undefined,
      userAspectRatio:
        typeof resolvedConfig.userAspectRatio === "string"
          ? resolvedConfig.userAspectRatio
          : undefined,
      imageSize:
        resolvedConfig.imageSize as GroupImageGenerateInput["imageSize"],
      quality:
        resolvedConfig.quality as GroupImageGenerateInput["quality"],
    };

    const newAsset = await generateImageInGroup(folderId, groupInput, {
      chatId: chatId ?? null,
    });

    // Persist the resolved config as the group's default for next time.
    await db
      .update(folders)
      .set({
        defaultGenerationConfig: resolvedConfig,
        updatedAt: new Date(),
      })
      .where(eq(folders.id, folderId));

    await touchFolder(folderId);

    return NextResponse.json({ image: newAsset });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "GROUP_NOT_FOUND") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (code === "GROUP_MODALITY_MISMATCH") {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 409 }
      );
    }
    console.error("Error generating in group:", error);
    return NextResponse.json(
      { error: "Failed to generate in group" },
      { status: 500 }
    );
  }
}
