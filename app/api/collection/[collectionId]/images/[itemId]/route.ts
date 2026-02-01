import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  getUserPermission,
  hasWritePermission,
  findItemById,
  touchCollection,
} from "@/lib/collection-utils";

/**
 * PATCH /api/collection/[collectionId]/images/[itemId]
 * Update image/video details (title)
 * 
 * itemId is the unique record ID (collection_images.id), not the imageId
 */
export async function PATCH(
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
    const { collectionId, itemId } = await params;

    // Check permission (must be owner or collaborator)
    const permission = await getUserPermission(collectionId, userId);
    if (!hasWritePermission(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to update items in this collection" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title } = body;

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return NextResponse.json(
        { error: "Title must be a non-empty string" },
        { status: 400 }
      );
    }

    // Find the item by its unique ID and verify it belongs to this collection
    const existingItem = await findItemById(itemId, collectionId);
    if (!existingItem) {
      return NextResponse.json(
        { error: "Item not found in collection" },
        { status: 404 }
      );
    }

    // Update the generationDetails with new title using jsonb_set
    const [updatedImage] = await db
      .update(collectionImages)
      .set({
        generationDetails: sql`jsonb_set(${collectionImages.generationDetails}, '{title}', ${JSON.stringify(title.trim())}::jsonb)`,
      })
      .where(eq(collectionImages.id, itemId))
      .returning();

    // Update collection's updatedAt
    await touchCollection(collectionId);

    return NextResponse.json({
      success: true,
      image: updatedImage
    });
  } catch (error) {
    console.error("Error updating image in collection:", error);
    return NextResponse.json(
      { error: "Failed to update image in collection" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/collection/[collectionId]/images/[itemId]
 * Remove image/video from collection
 * 
 * itemId is the unique record ID (collection_images.id), not the imageId
 */
export async function DELETE(
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
    const { collectionId, itemId } = await params;

    // Check permission (must be owner or collaborator)
    const permission = await getUserPermission(collectionId, userId);
    if (!hasWritePermission(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to remove items from this collection" },
        { status: 403 }
      );
    }

    // Delete item from collection by its unique ID, verifying it belongs to this collection
    const result = await db
      .delete(collectionImages)
      .where(
        and(
          eq(collectionImages.id, itemId),
          eq(collectionImages.collectionId, collectionId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Item not found in collection" },
        { status: 404 }
      );
    }

    // Update collection's updatedAt
    await touchCollection(collectionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing item from collection:", error);
    return NextResponse.json(
      { error: "Failed to remove item from collection" },
      { status: 500 }
    );
  }
}
