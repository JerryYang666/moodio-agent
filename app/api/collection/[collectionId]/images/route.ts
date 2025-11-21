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
 * POST /api/collection/[collectionId]/images
 * Add image to collection
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
    const { collectionId } = await params;

    // Check permission (must be owner or collaborator)
    const permission = await getUserPermission(collectionId, userId);
    if (permission !== "owner" && permission !== "collaborator") {
      return NextResponse.json(
        { error: "You don't have permission to add images to this collection" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { imageId, chatId, generationDetails } = body;

    if (!imageId || !generationDetails) {
      return NextResponse.json(
        { error: "imageId and generationDetails are required" },
        { status: 400 }
      );
    }

    // Check if image already exists in collection
    const [existingImage] = await db
      .select()
      .from(collectionImages)
      .where(
        and(
          eq(collectionImages.collectionId, collectionId),
          eq(collectionImages.imageId, imageId)
        )
      )
      .limit(1);

    if (existingImage) {
      return NextResponse.json(
        { error: "Image already exists in this collection" },
        { status: 400 }
      );
    }

    // Add image to collection
    const [newImage] = await db
      .insert(collectionImages)
      .values({
        collectionId,
        imageId,
        chatId: chatId || null,
        generationDetails,
      })
      .returning();

    // Update collection's updatedAt
    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, collectionId));

    return NextResponse.json({
      image: newImage,
    });
  } catch (error) {
    console.error("Error adding image to collection:", error);
    return NextResponse.json(
      { error: "Failed to add image to collection" },
      { status: 500 }
    );
  }
}

