import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";
import {
  getUserPermission,
  hasWritePermission,
  findImageInCollection,
  getCollection,
  touchCollection,
} from "@/lib/collection-utils";

type TransferAction = "move" | "copy";

/**
 * POST /api/collection/[collectionId]/images/[imageId]/transfer
 * Move or copy an image/video to a different collection
 * 
 * Body: { targetCollectionId: string, action: "move" | "copy" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collectionId: string; imageId: string }> }
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
    const { collectionId: sourceCollectionId, imageId } = await params;

    const body = await req.json();
    const { targetCollectionId, action } = body as {
      targetCollectionId: string;
      action: TransferAction;
    };

    // Validate input
    if (!targetCollectionId || typeof targetCollectionId !== "string") {
      return NextResponse.json(
        { error: "Target collection ID is required" },
        { status: 400 }
      );
    }

    if (!action || (action !== "move" && action !== "copy")) {
      return NextResponse.json(
        { error: "Action must be 'move' or 'copy'" },
        { status: 400 }
      );
    }

    if (action === "move" && sourceCollectionId === targetCollectionId) {
      return NextResponse.json(
        { error: "Source and target collections are the same" },
        { status: 400 }
      );
    }

    // Check permissions
    const sourcePermission = await getUserPermission(sourceCollectionId, userId);
    const targetPermission = await getUserPermission(targetCollectionId, userId);

    // For move: need write access to source
    // For copy: need at least read access to source
    if (action === "move" && !hasWritePermission(sourcePermission)) {
      return NextResponse.json(
        { error: "You don't have permission to move items from this collection" },
        { status: 403 }
      );
    }

    if (action === "copy" && !sourcePermission) {
      return NextResponse.json(
        { error: "You don't have access to the source collection" },
        { status: 403 }
      );
    }

    // Always need write access to target
    if (!hasWritePermission(targetPermission)) {
      return NextResponse.json(
        { error: "You don't have permission to add items to the target collection" },
        { status: 403 }
      );
    }

    // Get target collection
    const targetCollection = await getCollection(targetCollectionId);
    if (!targetCollection) {
      return NextResponse.json(
        { error: "Target collection not found" },
        { status: 404 }
      );
    }

    // Find the source image
    const sourceImage = await findImageInCollection(sourceCollectionId, imageId);
    if (!sourceImage) {
      return NextResponse.json(
        { error: "Image not found in source collection" },
        { status: 404 }
      );
    }

    // Check if image already exists in target collection
    const existingInTarget = await findImageInCollection(targetCollectionId, imageId);
    if (existingInTarget) {
      return NextResponse.json(
        { error: "Image already exists in target collection" },
        { status: 409 }
      );
    }

    let resultImage;

    if (action === "move") {
      // Move: update the existing record
      const [movedImage] = await db
        .update(collectionImages)
        .set({
          collectionId: targetCollectionId,
          projectId: targetCollection.projectId,
        })
        .where(eq(collectionImages.id, sourceImage.id))
        .returning();

      resultImage = movedImage;

      // Update both collections' timestamps
      await Promise.all([
        touchCollection(sourceCollectionId),
        touchCollection(targetCollectionId),
      ]);
    } else {
      // Copy: create a new record
      const [copiedImage] = await db
        .insert(collectionImages)
        .values({
          projectId: targetCollection.projectId,
          collectionId: targetCollectionId,
          imageId: sourceImage.imageId,
          assetId: sourceImage.assetId,
          assetType: sourceImage.assetType,
          chatId: sourceImage.chatId,
          generationDetails: sourceImage.generationDetails,
        })
        .returning();

      resultImage = copiedImage;

      // Only update target collection's timestamp
      await touchCollection(targetCollectionId);
    }

    return NextResponse.json({
      success: true,
      action,
      image: resultImage,
    });
  } catch (error) {
    console.error(`Error transferring image between collections:`, error);
    return NextResponse.json(
      { error: "Failed to transfer image between collections" },
      { status: 500 }
    );
  }
}
