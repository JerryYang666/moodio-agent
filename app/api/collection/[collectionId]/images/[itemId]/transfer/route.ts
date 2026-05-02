import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";
import {
  getUserPermission,
  hasWritePermission,
  findItemById,
  getCollection,
  touchCollection,
} from "@/lib/collection-utils";
import {
  getFolderPermission,
  hasFolderWritePermission,
  getFolder,
  getFolderWithProject,
  touchFolder,
} from "@/lib/folder-utils";
import { assetTypeMatchesModality } from "@/lib/groups/service";

type TransferAction = "move" | "copy";

/**
 * POST /api/collection/[collectionId]/images/[itemId]/transfer
 * Move or copy an image/video to a different collection or folder.
 * 
 * itemId is the unique record ID (collection_images.id), not the imageId
 * Body: { targetCollectionId?: string, targetFolderId?: string, action: "move" | "copy" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collectionId: string; itemId: string }> }
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
    const { collectionId: sourceCollectionId, itemId } = await params;

    const body = await req.json();
    const { targetCollectionId, targetFolderId, action } = body as {
      targetCollectionId?: string;
      targetFolderId?: string;
      action: TransferAction;
    };

    if (!targetCollectionId && !targetFolderId) {
      return NextResponse.json(
        { error: "Either targetCollectionId or targetFolderId is required" },
        { status: 400 }
      );
    }

    if (!action || (action !== "move" && action !== "copy")) {
      return NextResponse.json(
        { error: "Action must be 'move' or 'copy'" },
        { status: 400 }
      );
    }

    // Check source permissions (collection-level, then folder-level fallback)
    const sourcePermission = await getUserPermission(sourceCollectionId, userId);

    const sourceItem = await findItemById(itemId, sourceCollectionId);
    if (!sourceItem) {
      return NextResponse.json(
        { error: "Item not found in source collection" },
        { status: 404 }
      );
    }

    if (action === "move") {
      let canWriteSource = hasWritePermission(sourcePermission);
      if (!canWriteSource && sourceItem.folderId) {
        const folderPerm = await getFolderPermission(sourceItem.folderId, userId);
        canWriteSource = hasFolderWritePermission(folderPerm);
      }
      if (!canWriteSource) {
        return NextResponse.json(
          { error: "You don't have permission to move items from this collection" },
          { status: 403 }
        );
      }
    }

    if (action === "copy" && !sourcePermission) {
      let hasAccess = false;
      if (sourceItem.folderId) {
        const folderPerm = await getFolderPermission(sourceItem.folderId, userId);
        hasAccess = folderPerm !== null;
      }
      if (!hasAccess) {
        return NextResponse.json(
          { error: "You don't have access to the source collection" },
          { status: 403 }
        );
      }
    }

    // Resolve target
    let resolvedProjectId: string;
    let resolvedCollectionId: string;
    let resolvedFolderId: string | null = null;

    if (targetFolderId) {
      const targetPermission = await getFolderPermission(targetFolderId, userId);
      if (!hasFolderWritePermission(targetPermission)) {
        return NextResponse.json(
          { error: "You don't have permission to add items to the target folder" },
          { status: 403 }
        );
      }

      const targetData = await getFolderWithProject(targetFolderId);
      if (!targetData) {
        return NextResponse.json(
          { error: "Target folder not found" },
          { status: 404 }
        );
      }

      // Modality lock for group folders.
      if (
        targetData.folder.modality &&
        !assetTypeMatchesModality(
          sourceItem.assetType,
          targetData.folder.modality as "image" | "video"
        )
      ) {
        return NextResponse.json(
          {
            error: `Target is a ${targetData.folder.modality} group; ${sourceItem.assetType} assets cannot be added`,
          },
          { status: 409 }
        );
      }

      resolvedProjectId = targetData.projectId;
      resolvedCollectionId = targetData.folder.collectionId;
      resolvedFolderId = targetFolderId;
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

      resolvedProjectId = targetCollection.projectId;
      resolvedCollectionId = targetCollectionId!;
    }

    if (action === "move" && sourceCollectionId === resolvedCollectionId && !resolvedFolderId) {
      return NextResponse.json(
        { error: "Source and target are the same" },
        { status: 400 }
      );
    }

    let resultImage;

    if (action === "move") {
      const [movedImage] = await db
        .update(collectionImages)
        .set({
          collectionId: resolvedCollectionId,
          projectId: resolvedProjectId,
          folderId: resolvedFolderId,
        })
        .where(eq(collectionImages.id, itemId))
        .returning();

      resultImage = movedImage;

      await touchCollection(sourceCollectionId);
      if (resolvedFolderId) await touchFolder(resolvedFolderId);
      else await touchCollection(resolvedCollectionId);
    } else {
      const [copiedImage] = await db
        .insert(collectionImages)
        .values({
          projectId: resolvedProjectId,
          collectionId: resolvedCollectionId,
          folderId: resolvedFolderId,
          imageId: sourceItem.imageId,
          assetId: sourceItem.assetId,
          assetType: sourceItem.assetType,
          chatId: sourceItem.chatId,
          generationDetails: sourceItem.generationDetails,
        })
        .returning();

      resultImage = copiedImage;

      if (resolvedFolderId) await touchFolder(resolvedFolderId);
      else await touchCollection(resolvedCollectionId);
    }

    return NextResponse.json({
      success: true,
      action,
      image: resultImage,
    });
  } catch (error) {
    console.error(`Error transferring item:`, error);
    return NextResponse.json(
      { error: "Failed to transfer item" },
      { status: 500 }
    );
  }
}
