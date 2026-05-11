import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  collectionImages,
  collections,
  desktopAssets,
  folders,
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, eq, inArray } from "drizzle-orm";
import { getDesktopPermission } from "@/lib/desktop/permissions";
import { getUserPermission } from "@/lib/collection-utils";
import { hasWriteAccess } from "@/lib/permissions";
import {
  getFolderPermission,
  hasFolderWritePermission,
  touchFolder,
} from "@/lib/folder-utils";

/**
 * POST /api/desktop/[id]/assets/save-to-collection
 *
 * Save one or more desktop assets into a collection (optionally into a
 * specific folder). The client passes desktop asset IDs — the server pulls
 * each asset's metadata and maps it to the right collection_images row
 * (imageId / assetId / assetType / chatId / generationDetails).
 *
 * Supported asset types: image, video, audio, public_image, public_video.
 * Other types (text, link, table, video_suggest) are reported back as
 * "skipped" so the UI can surface a partial-success toast.
 *
 * Request body:
 *   { assetIds: string[]; collectionId: string; folderId?: string | null }
 *
 * Response:
 *   {
 *     saved: Array<{ assetId: string; collectionImageId: string }>,
 *     skipped: Array<{ assetId: string; reason: string }>,
 *     duplicates: string[]   // desktop asset IDs already in this collection
 *   }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const tokenPayload = await verifyAccessToken(accessToken);
    if (!tokenPayload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = tokenPayload.userId;
    const { id: desktopId } = await params;

    // The caller only needs read access on the desktop to save assets to
    // their own collection — they're copying out, not mutating the desktop.
    const desktopPerm = await getDesktopPermission(desktopId, userId);
    if (!desktopPerm) {
      return NextResponse.json(
        { error: "Desktop not found or access denied" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { assetIds, collectionId, folderId } = body as {
      assetIds?: unknown;
      collectionId?: unknown;
      folderId?: unknown;
    };

    if (typeof collectionId !== "string" || !collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: "assetIds must be a non-empty array" },
        { status: 400 }
      );
    }

    const ids = Array.from(
      new Set(
        assetIds.filter((v): v is string => typeof v === "string" && !!v)
      )
    );
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "assetIds must contain at least one string" },
        { status: 400 }
      );
    }

    const resolvedFolderId =
      typeof folderId === "string" && folderId ? folderId : null;

    // Collection write check
    const collectionPerm = await getUserPermission(collectionId, userId);
    if (!hasWriteAccess(collectionPerm)) {
      return NextResponse.json(
        { error: "You don't have permission to add assets to this collection" },
        { status: 403 }
      );
    }

    const [collection] = await db
      .select({ projectId: collections.projectId })
      .from(collections)
      .where(eq(collections.id, collectionId))
      .limit(1);

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    // Folder scope + write check
    if (resolvedFolderId) {
      const [folder] = await db
        .select({ collectionId: folders.collectionId })
        .from(folders)
        .where(eq(folders.id, resolvedFolderId))
        .limit(1);

      if (!folder || folder.collectionId !== collectionId) {
        return NextResponse.json(
          { error: "Folder not found in this collection" },
          { status: 400 }
        );
      }

      const folderPerm = await getFolderPermission(resolvedFolderId, userId);
      if (!hasFolderWritePermission(folderPerm)) {
        return NextResponse.json(
          { error: "You don't have permission to add assets to this folder" },
          { status: 403 }
        );
      }
    }

    // Fetch all requested desktop assets in one query (scoped to this desktop)
    const rows = await db
      .select()
      .from(desktopAssets)
      .where(
        and(
          eq(desktopAssets.desktopId, desktopId),
          inArray(desktopAssets.id, ids)
        )
      );

    const rowById = new Map(rows.map((r) => [r.id, r]));

    const saved: Array<{ assetId: string; collectionImageId: string }> = [];
    const skipped: Array<{ assetId: string; reason: string }> = [];
    const duplicates: string[] = [];

    // Map a desktop asset into the shape expected by collection_images. Returns
    // null (with a reason) for asset types we don't persist to collections.
    const toCollectionRow = (
      asset: typeof desktopAssets.$inferSelect
    ):
      | {
          imageId: string;
          collectionAssetId: string;
          collectionAssetType: string;
          chatId: string | null;
          generationDetails: Record<string, unknown>;
        }
      | { error: string } => {
      const meta = asset.metadata as Record<string, unknown>;
      const chatId =
        typeof meta.chatId === "string" && meta.chatId ? meta.chatId : null;
      const title = typeof meta.title === "string" ? meta.title : "";
      const prompt = typeof meta.prompt === "string" ? meta.prompt : "";
      const status =
        typeof meta.status === "string" ? meta.status : "generated";

      switch (asset.assetType) {
        case "image": {
          const imageId =
            typeof meta.imageId === "string" ? meta.imageId : null;
          if (!imageId) return { error: "missing imageId" };
          return {
            imageId,
            collectionAssetId: imageId,
            collectionAssetType: "image",
            chatId,
            generationDetails: { title, prompt, status },
          };
        }
        case "video": {
          const imageId =
            typeof meta.imageId === "string" ? meta.imageId : null;
          const videoId =
            typeof meta.videoId === "string" ? meta.videoId : null;
          if (!imageId || !videoId) {
            // In-progress videos (generationId only) can't be saved yet.
            return { error: "video not ready" };
          }
          return {
            imageId,
            collectionAssetId: videoId,
            collectionAssetType: "video",
            chatId,
            generationDetails: { title, prompt, status },
          };
        }
        case "audio": {
          const audioId =
            typeof meta.audioId === "string" ? meta.audioId : null;
          if (!audioId) return { error: "missing audioId" };
          return {
            imageId: "audio-file-placeholder",
            collectionAssetId: audioId,
            collectionAssetType: "audio",
            chatId,
            generationDetails: { title, prompt, status },
          };
        }
        case "public_image": {
          const storageKey =
            typeof meta.storageKey === "string" ? meta.storageKey : null;
          const contentUuid =
            typeof meta.contentUuid === "string" ? meta.contentUuid : null;
          if (!storageKey || !contentUuid) {
            return { error: "missing storageKey or contentUuid" };
          }
          return {
            imageId: contentUuid,
            collectionAssetId: storageKey,
            collectionAssetType: "public_image",
            chatId: null,
            generationDetails: { title, prompt: "", status: "generated" },
          };
        }
        case "public_video": {
          const storageKey =
            typeof meta.storageKey === "string" ? meta.storageKey : null;
          const contentUuid =
            typeof meta.contentUuid === "string" ? meta.contentUuid : null;
          if (!storageKey || !contentUuid) {
            return { error: "missing storageKey or contentUuid" };
          }
          return {
            imageId: contentUuid,
            collectionAssetId: storageKey,
            collectionAssetType: "public_video",
            chatId: null,
            generationDetails: { title, prompt: "", status: "generated" },
          };
        }
        default:
          return { error: `unsupported assetType: ${asset.assetType}` };
      }
    };

    // Pre-resolve all candidates so we can dedupe against what's already in
    // the collection in a single query.
    const candidates: Array<{
      desktopAssetId: string;
      imageId: string;
      collectionAssetId: string;
      collectionAssetType: string;
      chatId: string | null;
      generationDetails: Record<string, unknown>;
    }> = [];

    for (const desktopAssetId of ids) {
      const row = rowById.get(desktopAssetId);
      if (!row) {
        skipped.push({ assetId: desktopAssetId, reason: "not found" });
        continue;
      }
      const mapped = toCollectionRow(row);
      if ("error" in mapped) {
        skipped.push({ assetId: desktopAssetId, reason: mapped.error });
        continue;
      }
      candidates.push({
        desktopAssetId,
        imageId: mapped.imageId,
        collectionAssetId: mapped.collectionAssetId,
        collectionAssetType: mapped.collectionAssetType,
        chatId: mapped.chatId,
        generationDetails: mapped.generationDetails,
      });
    }

    // Dedupe against rows already in this collection (match on assetId).
    if (candidates.length > 0) {
      const existing = await db
        .select({ assetId: collectionImages.assetId })
        .from(collectionImages)
        .where(
          and(
            eq(collectionImages.collectionId, collectionId),
            inArray(
              collectionImages.assetId,
              candidates.map((c) => c.collectionAssetId)
            )
          )
        );
      const existingAssetIds = new Set(existing.map((e) => e.assetId));

      const toInsert = candidates.filter((c) => {
        if (existingAssetIds.has(c.collectionAssetId)) {
          duplicates.push(c.desktopAssetId);
          return false;
        }
        return true;
      });

      if (toInsert.length > 0) {
        const inserted = await db
          .insert(collectionImages)
          .values(
            toInsert.map((c) => ({
              projectId: collection.projectId,
              collectionId,
              folderId: resolvedFolderId,
              imageId: c.imageId,
              assetId: c.collectionAssetId,
              assetType: c.collectionAssetType,
              chatId: c.chatId,
              generationDetails: c.generationDetails,
            }))
          )
          .returning({ id: collectionImages.id, assetId: collectionImages.assetId });

        // Stitch returned rows back to the desktop asset IDs they came from.
        // Multiple desktop assets *could* share the same collectionAssetId
        // (duplicates across the same video, etc.), but we deduped above.
        const insertedByAssetId = new Map(
          inserted.map((r) => [r.assetId, r.id])
        );
        for (const c of toInsert) {
          const collectionImageId = insertedByAssetId.get(c.collectionAssetId);
          if (collectionImageId) {
            saved.push({
              assetId: c.desktopAssetId,
              collectionImageId,
            });
          }
        }

        await db
          .update(collections)
          .set({ updatedAt: new Date() })
          .where(eq(collections.id, collectionId));

        if (resolvedFolderId) await touchFolder(resolvedFolderId);
      }
    }

    return NextResponse.json({ saved, skipped, duplicates });
  } catch (error) {
    console.error("Error saving desktop assets to collection:", error);
    return NextResponse.json(
      { error: "Failed to save assets to collection" },
      { status: 500 }
    );
  }
}
