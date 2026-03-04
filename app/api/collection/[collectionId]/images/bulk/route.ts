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

type BulkAction = "move" | "copy" | "delete";

/**
 * POST /api/collection/[collectionId]/images/bulk
 * Bulk move, copy, or delete items in a collection.
 *
 * Body: { itemIds: string[], action: "move" | "copy" | "delete", targetCollectionId?: string }
 * - move/copy require targetCollectionId
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
    const { itemIds, action, targetCollectionId } = body as {
      itemIds: string[];
      action: BulkAction;
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

    if ((action === "move" || action === "copy") && !targetCollectionId) {
      return NextResponse.json(
        { error: "targetCollectionId is required for move/copy" },
        { status: 400 }
      );
    }

    if (action === "move" && sourceCollectionId === targetCollectionId) {
      return NextResponse.json(
        { error: "Source and target collections are the same" },
        { status: 400 }
      );
    }

    const sourcePermission = await getUserPermission(sourceCollectionId, userId);

    if (action === "delete" || action === "move") {
      if (!hasWritePermission(sourcePermission)) {
        return NextResponse.json(
          { error: "You don't have permission to modify items in this collection" },
          { status: 403 }
        );
      }
    } else if (action === "copy" && !sourcePermission) {
      return NextResponse.json(
        { error: "You don't have access to the source collection" },
        { status: 403 }
      );
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

    // move or copy — need target
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

    if (action === "move") {
      await db
        .update(collectionImages)
        .set({
          collectionId: targetCollectionId!,
          projectId: targetCollection.projectId,
        })
        .where(
          and(
            inArray(collectionImages.id, Array.from(foundIds)),
            eq(collectionImages.collectionId, sourceCollectionId)
          )
        );

      await Promise.all([
        touchCollection(sourceCollectionId),
        touchCollection(targetCollectionId!),
      ]);
    } else {
      // copy
      const newRows = sourceItems.map((item) => ({
        projectId: targetCollection.projectId,
        collectionId: targetCollectionId!,
        imageId: item.imageId,
        assetId: item.assetId,
        assetType: item.assetType,
        chatId: item.chatId,
        generationDetails: item.generationDetails,
      }));

      await db.insert(collectionImages).values(newRows);
      await touchCollection(targetCollectionId!);
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
