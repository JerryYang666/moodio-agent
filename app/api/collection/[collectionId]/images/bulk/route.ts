import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and, inArray } from "drizzle-orm";
import {
  getUserPermission,
  hasWritePermission,
  getCollection,
  touchCollection,
} from "@/lib/collection-utils";
import {
  getFolderPermission,
  hasFolderWritePermission,
  getFolderWithProject,
  touchFolder,
} from "@/lib/folder-utils";

type BulkAction = "move" | "copy" | "delete";

/**
 * POST /api/collection/[collectionId]/images/bulk
 * Bulk move, copy, or delete items in a collection.
 *
 * Body: { itemIds: string[], action: "move" | "copy" | "delete", targetCollectionId?: string, targetFolderId?: string }
 * - move/copy require targetCollectionId or targetFolderId
 * - delete only needs itemIds
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
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
    const { collectionId: sourceCollectionId } = await params;

    const body = await req.json();
    const { itemIds, action, targetCollectionId, targetFolderId } = body as {
      itemIds: string[];
      action: BulkAction;
      targetCollectionId?: string;
      targetFolderId?: string;
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

    if ((action === "move" || action === "copy") && !targetCollectionId && !targetFolderId) {
      return NextResponse.json(
        { error: "targetCollectionId or targetFolderId is required for move/copy" },
        { status: 400 }
      );
    }

    if (action === "move" && sourceCollectionId === targetCollectionId && !targetFolderId) {
      return NextResponse.json(
        { error: "Source and target collections are the same" },
        { status: 400 }
      );
    }

    const sourcePermission = await getUserPermission(sourceCollectionId, userId);

    // For delete/move, check if user can write to source.
    // If collection-level permission is insufficient, check folder-level for folder assets.
    if (action === "delete" || action === "move") {
      let canWriteSource = hasWritePermission(sourcePermission);

      if (!canWriteSource) {
        const firstItem = await db
          .select({ folderId: collectionImages.folderId })
          .from(collectionImages)
          .where(
            and(
              inArray(collectionImages.id, itemIds),
              eq(collectionImages.collectionId, sourceCollectionId)
            )
          )
          .limit(1);

        if (firstItem.length > 0 && firstItem[0].folderId) {
          const folderPerm = await getFolderPermission(firstItem[0].folderId, userId);
          canWriteSource = hasFolderWritePermission(folderPerm);
        }
      }

      if (!canWriteSource) {
        return NextResponse.json(
          { error: "You don't have permission to modify items in this collection" },
          { status: 403 }
        );
      }
    } else if (action === "copy" && !sourcePermission) {
      // For copy, we need at least read access. Check folder-level too.
      const firstItem = await db
        .select({ folderId: collectionImages.folderId })
        .from(collectionImages)
        .where(
          and(
            inArray(collectionImages.id, itemIds),
            eq(collectionImages.collectionId, sourceCollectionId)
          )
        )
        .limit(1);

      let hasAccess = false;
      if (firstItem.length > 0 && firstItem[0].folderId) {
        const folderPerm = await getFolderPermission(firstItem[0].folderId, userId);
        hasAccess = folderPerm !== null;
      }

      if (!hasAccess) {
        return NextResponse.json(
          { error: "You don't have access to the source collection" },
          { status: 403 }
        );
      }
    }

    // Verify all items belong to this collection
    const sourceItems = await db
      .select()
      .from(collectionImages)
      .where(
        and(
          inArray(collectionImages.id, itemIds),
          eq(collectionImages.collectionId, sourceCollectionId)
        )
      );

    if (sourceItems.length === 0) {
      return NextResponse.json(
        { error: "No matching items found in collection" },
        { status: 404 }
      );
    }

    const foundIds = new Set(sourceItems.map((i) => i.id));

    if (action === "delete") {
      await db
        .delete(collectionImages)
        .where(
          and(
            inArray(collectionImages.id, Array.from(foundIds)),
            eq(collectionImages.collectionId, sourceCollectionId)
          )
        );

      await touchCollection(sourceCollectionId);

      return NextResponse.json({
        success: true,
        action,
        count: foundIds.size,
      });
    }

    // move or copy — resolve target (folder or collection)
    let resolvedTargetFolderId: string | null = null;
    let resolvedCollectionId: string;
    let resolvedProjectId: string;

    if (targetFolderId) {
      const folderPermission = await getFolderPermission(targetFolderId, userId);
      if (!hasFolderWritePermission(folderPermission)) {
        return NextResponse.json(
          { error: "You don't have permission to add items to the target folder" },
          { status: 403 }
        );
      }

      const targetData = await getFolderWithProject(targetFolderId);
      if (!targetData) {
        return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
      }

      resolvedTargetFolderId = targetFolderId;
      resolvedCollectionId = targetData.folder.collectionId;
      resolvedProjectId = targetData.projectId;
    } else {
      const targetPermission = await getUserPermission(targetCollectionId!, userId);
      if (!hasWritePermission(targetPermission)) {
        return NextResponse.json(
          { error: "You don't have permission to add items to the target collection" },
          { status: 403 }
        );
      }

      const targetCollection = await getCollection(targetCollectionId!);
      if (!targetCollection) {
        return NextResponse.json(
          { error: "Target collection not found" },
          { status: 404 }
        );
      }

      resolvedCollectionId = targetCollectionId!;
      resolvedProjectId = targetCollection.projectId;
    }

    if (action === "move") {
      await db
        .update(collectionImages)
        .set({
          collectionId: resolvedCollectionId,
          projectId: resolvedProjectId,
          folderId: resolvedTargetFolderId,
        })
        .where(
          and(
            inArray(collectionImages.id, Array.from(foundIds)),
            eq(collectionImages.collectionId, sourceCollectionId)
          )
        );

      await touchCollection(sourceCollectionId);
      if (resolvedTargetFolderId) await touchFolder(resolvedTargetFolderId);
      else await touchCollection(resolvedCollectionId);
    } else {
      // copy
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

    return NextResponse.json({
      success: true,
      action,
      count: foundIds.size,
    });
  } catch (error) {
    console.error("Error in bulk operation:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk operation" },
      { status: 500 }
    );
  }
}
