import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionShares, users } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";

// Helper to check if user is owner
async function isOwner(collectionId: string, userId: string): Promise<boolean> {
  const [collection] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);

  return !!collection;
}

/**
 * POST /api/collection/[collectionId]/share
 * Share collection with a user (owner only)
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

    // Check if user is owner
    if (!(await isOwner(collectionId, userId))) {
      return NextResponse.json(
        { error: "Only the owner can share the collection" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { sharedWithUserId, permission } = body;

    if (!sharedWithUserId || !permission) {
      return NextResponse.json(
        { error: "sharedWithUserId and permission are required" },
        { status: 400 }
      );
    }

    if (permission !== "viewer" && permission !== "collaborator") {
      return NextResponse.json(
        { error: "permission must be 'viewer' or 'collaborator'" },
        { status: 400 }
      );
    }

    // Check if user exists
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, sharedWithUserId))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Don't allow sharing with self
    if (sharedWithUserId === userId) {
      return NextResponse.json(
        { error: "Cannot share collection with yourself" },
        { status: 400 }
      );
    }

    // Check if already shared
    const [existingShare] = await db
      .select()
      .from(collectionShares)
      .where(
        and(
          eq(collectionShares.collectionId, collectionId),
          eq(collectionShares.sharedWithUserId, sharedWithUserId)
        )
      )
      .limit(1);

    if (existingShare) {
      // Update existing share permission
      const [updatedShare] = await db
        .update(collectionShares)
        .set({ permission })
        .where(eq(collectionShares.id, existingShare.id))
        .returning();

      return NextResponse.json({
        share: updatedShare,
        updated: true,
      });
    }

    // Create new share
    const [newShare] = await db
      .insert(collectionShares)
      .values({
        collectionId,
        sharedWithUserId,
        permission,
      })
      .returning();

    return NextResponse.json({
      share: newShare,
      updated: false,
    });
  } catch (error) {
    console.error("Error sharing collection:", error);
    return NextResponse.json(
      { error: "Failed to share collection" },
      { status: 500 }
    );
  }
}

