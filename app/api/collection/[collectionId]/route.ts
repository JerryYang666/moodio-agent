import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { 
  collections, 
  collectionImages, 
  collectionShares,
  type CollectionShare,
  users
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and, or, desc } from "drizzle-orm";
import { getSignedImageUrl } from "@/lib/storage/s3";

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
 * GET /api/collection/[collectionId]
 * Get collection details with images
 */
export async function GET(
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
    const { collectionId } = await params;

    // Check permission
    const permission = await getUserPermission(collectionId, userId);
    if (!permission) {
      return NextResponse.json(
        { error: "Collection not found or access denied" },
        { status: 404 }
      );
    }

    // Get collection details
    const [collection] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, collectionId))
      .limit(1);

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    // Get images in collection
    const rawImages = await db
      .select()
      .from(collectionImages)
      .where(eq(collectionImages.collectionId, collectionId))
      .orderBy(desc(collectionImages.addedAt));

    // Add signed CloudFront URLs to images
    const images = rawImages.map((img) => ({
      ...img,
      imageUrl: getSignedImageUrl(img.imageId),
    }));

    // Get shares if user is owner
    let shares: (CollectionShare & { email: string })[] = [];
    if (permission === "owner") {
      const sharesData = await db
        .select({
          id: collectionShares.id,
          collectionId: collectionShares.collectionId,
          sharedWithUserId: collectionShares.sharedWithUserId,
          permission: collectionShares.permission,
          sharedAt: collectionShares.sharedAt,
          email: users.email,
        })
        .from(collectionShares)
        .innerJoin(users, eq(collectionShares.sharedWithUserId, users.id))
        .where(eq(collectionShares.collectionId, collectionId));

      shares = sharesData.map(s => ({
        id: s.id,
        collectionId: s.collectionId,
        sharedWithUserId: s.sharedWithUserId,
        permission: s.permission as "viewer" | "collaborator",
        sharedAt: s.sharedAt,
        email: s.email
      }));
    }

    return NextResponse.json({
      collection: {
        ...collection,
        permission,
        isOwner: permission === "owner",
      },
      images,
      shares,
    });
  } catch (error) {
    console.error("Error fetching collection:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/collection/[collectionId]
 * Rename collection (owner only)
 */
export async function PATCH(
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
    const { collectionId } = await params;

    // Check permission (must be owner)
    const permission = await getUserPermission(collectionId, userId);
    if (permission !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can rename the collection" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Collection name is required" },
        { status: 400 }
      );
    }

    // Update collection
    const [updatedCollection] = await db
      .update(collections)
      .set({
        name: name.trim(),
        updatedAt: new Date(),
      })
      .where(eq(collections.id, collectionId))
      .returning();

    return NextResponse.json({
      collection: {
        ...updatedCollection,
        permission: "owner",
        isOwner: true,
      },
    });
  } catch (error) {
    console.error("Error updating collection:", error);
    return NextResponse.json(
      { error: "Failed to update collection" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/collection/[collectionId]
 * Delete collection (owner only)
 */
export async function DELETE(
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
    const { collectionId } = await params;

    // Check permission (must be owner)
    const permission = await getUserPermission(collectionId, userId);
    if (permission !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can delete the collection" },
        { status: 403 }
      );
    }

    // Delete collection (cascade will handle images and shares)
    await db.delete(collections).where(eq(collections.id, collectionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting collection:", error);
    return NextResponse.json(
      { error: "Failed to delete collection" },
      { status: 500 }
    );
  }
}

