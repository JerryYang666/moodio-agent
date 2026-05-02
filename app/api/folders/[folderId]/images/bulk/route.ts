import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages, collections } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and, inArray } from "drizzle-orm";
import {
  getFolderPermission,
  hasFolderWritePermission,
  getFolder,
  touchFolder,
} from "@/lib/folder-utils";
import { getUserPermission, hasWritePermission, getCollection, touchCollection } from "@/lib/collection-utils";
import { assetTypeMatchesModality } from "@/lib/groups/service";

type BulkAction = "move" | "copy" | "delete";

/**
 * POST /api/folders/[folderId]/images/bulk
 * Bulk move, copy, or delete assets in a folder.
 *
 * Body: {
 *   itemIds: string[],
 *   action: "move" | "copy" | "delete",
 *   targetFolderId?: string,
 *   targetCollectionId?: string
 * }
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
    const { folderId: sourceFolderId } = await params;

    const body = await req.json();
    const { itemIds, action, targetFolderId, targetCollectionId } = body as {
      itemIds: string[];
      action: BulkAction;
      targetFolderId?: string;
      targetCollectionId?: string;
    };

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json(
        { error: "itemIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!action || !["move", "copy", "delete"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be 'move', 'copy', or 'delete'" },
        { status: 400 }
      );
    }

    if ((action === "move" || action === "copy") && !targetFolderId && !targetCollectionId) {
      return NextResponse.json(
        { error: "targetFolderId or targetCollectionId is required for move/copy" },
        { status: 400 }
      );
    }

    const sourcePermission = await getFolderPermission(sourceFolderId, userId);
    if (action === "delete" || action === "move") {
      if (!hasFolderWritePermission(sourcePermission)) {
        return NextResponse.json(
          { error: "You don't have permission to modify assets in this folder" },
          { status: 403 }
        );
      }
    } else if (action === "copy" && !sourcePermission) {
      return NextResponse.json(
        { error: "You don't have access to the source folder" },
        { status: 403 }
      );
    }

    // Verify items belong to this folder
    const sourceItems = await db
      .select()
      .from(collectionImages)
      .where(
        and(
          inArray(collectionImages.id, itemIds),
          eq(collectionImages.folderId, sourceFolderId)
        )
      );

    if (sourceItems.length === 0) {
      return NextResponse.json(
        { error: "No matching items found in folder" },
        { status: 404 }
      );
    }

    const foundIds = Array.from(new Set(sourceItems.map((i) => i.id)));

    if (action === "delete") {
      await db
        .delete(collectionImages)
        .where(
          and(
            inArray(collectionImages.id, foundIds),
            eq(collectionImages.folderId, sourceFolderId)
          )
        );

      await touchFolder(sourceFolderId);
      return NextResponse.json({ success: true, action, count: foundIds.length });
    }

    // Move or copy -- resolve target
    let resolvedTargetFolderId: string | null = targetFolderId || null;
    let resolvedCollectionId: string;
    let resolvedProjectId: string;

    if (targetFolderId) {
      const targetPermission = await getFolderPermission(targetFolderId, userId);
      if (!hasFolderWritePermission(targetPermission)) {
        return NextResponse.json(
          { error: "You don't have permission to add items to the target folder" },
          { status: 403 }
        );
      }

      const targetFolder = await getFolder(targetFolderId);
      if (!targetFolder) {
        return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
      }

      // Modality lock: every source item must match the target group's modality.
      if (targetFolder.modality) {
        const mismatched = sourceItems.find(
          (it) =>
            !assetTypeMatchesModality(
              it.assetType,
              targetFolder.modality as "image" | "video"
            )
        );
        if (mismatched) {
          return NextResponse.json(
            {
              error: `Target is a ${targetFolder.modality} group; ${mismatched.assetType} assets cannot be added`,
            },
            { status: 409 }
          );
        }
      }

      const [coll] = await db
        .select({ projectId: collections.projectId })
        .from(collections)
        .where(eq(collections.id, targetFolder.collectionId))
        .limit(1);

      resolvedCollectionId = targetFolder.collectionId;
      resolvedProjectId = coll!.projectId;
    } else {
      const targetPermission = await getUserPermission(targetCollectionId!, userId);
      if (!hasWritePermission(targetPermission)) {
        return NextResponse.json(
          { error: "You don't have permission to add items to the target collection" },
          { status: 403 }
        );
      }

      const targetColl = await getCollection(targetCollectionId!);
      if (!targetColl) {
        return NextResponse.json({ error: "Target collection not found" }, { status: 404 });
      }

      resolvedTargetFolderId = null;
      resolvedCollectionId = targetColl.id;
      resolvedProjectId = targetColl.projectId;
    }

    if (action === "move") {
      await db
        .update(collectionImages)
        .set({
          folderId: resolvedTargetFolderId,
          collectionId: resolvedCollectionId,
          projectId: resolvedProjectId,
        })
        .where(
          and(
            inArray(collectionImages.id, foundIds),
            eq(collectionImages.folderId, sourceFolderId)
          )
        );

      await touchFolder(sourceFolderId);
      if (resolvedTargetFolderId) await touchFolder(resolvedTargetFolderId);
      else await touchCollection(resolvedCollectionId);
    } else {
      const newRows = sourceItems.map((item) => ({
        projectId: resolvedProjectId,
        collectionId: resolvedCollectionId,
        folderId: resolvedTargetFolderId,
        imageId: item.imageId,
        assetId: item.assetId,
        assetType: item.assetType,
        chatId: item.chatId,
        generationDetails: item.generationDetails,
      }));

      await db.insert(collectionImages).values(newRows);
      if (resolvedTargetFolderId) await touchFolder(resolvedTargetFolderId);
      else await touchCollection(resolvedCollectionId);
    }

    return NextResponse.json({ success: true, action, count: foundIds.length });
  } catch (error) {
    console.error("Error in folder bulk operation:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk operation" },
      { status: 500 }
    );
  }
}
