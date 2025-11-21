import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionImages, collectionShares } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";

// Helper to check user's permission for a collection
async function getUserPermission(
  collectionId: string,
  userId: string
): Promise<"owner" | "collaborator" | "viewer" | null> {
  // Check if user owns the collection
  const [collection] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);

  if (collection) {
    return "owner";
  }

  // Check if collection is shared with user
  const [share] = await db
    .select()
    .from(collectionShares)
    .where(
      and(
        eq(collectionShares.collectionId, collectionId),
        eq(collectionShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (share) {
    return share.permission as "collaborator" | "viewer";
  }

  return null;
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
    if (permission !== "owner" && permission !== "collaborator") {
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
    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, collectionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing image from collection:", error);
    return NextResponse.json(
      { error: "Failed to remove image from collection" },
      { status: 500 }
    );
  }
}

