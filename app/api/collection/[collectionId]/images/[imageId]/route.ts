import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  getUserPermission,
  hasWritePermission,
  findImageInCollection,
  touchCollection,
} from "@/lib/collection-utils";

/**
 * PATCH /api/collection/[collectionId]/images/[imageId]
 * Update image/video details (title)
 */
export async function PATCH(
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
    const { collectionId, imageId } = await params;

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

    // Find the image in the collection
    const existingImage = await findImageInCollection(collectionId, imageId);
    if (!existingImage) {
      return NextResponse.json(
        { error: "Image not found in collection" },
        { status: 404 }
      );
    }

    // Update the generationDetails with new title using jsonb_set
    const [updatedImage] = await db
      .update(collectionImages)
      .set({
        generationDetails: sql`jsonb_set(${collectionImages.generationDetails}, '{title}', ${JSON.stringify(title.trim())}::jsonb)`,
      })
      .where(
        and(
          eq(collectionImages.collectionId, collectionId),
          eq(collectionImages.imageId, imageId)
        )
      )
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
 * DELETE /api/collection/[collectionId]/images/[imageId]
 * Remove image from collection
 */
export async function DELETE(
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
    const { collectionId, imageId } = await params;

    // Check permission (must be owner or collaborator)
    const permission = await getUserPermission(collectionId, userId);
    if (!hasWritePermission(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to remove images from this collection" },
        { status: 403 }
      );
    }

    // Delete image from collection
    const result = await db
      .delete(collectionImages)
      .where(
        and(
          eq(collectionImages.collectionId, collectionId),
          eq(collectionImages.imageId, imageId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Image not found in collection" },
        { status: 404 }
      );
    }

    // Update collection's updatedAt
    await touchCollection(collectionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing image from collection:", error);
    return NextResponse.json(
      { error: "Failed to remove image from collection" },
      { status: 500 }
    );
  }
}

