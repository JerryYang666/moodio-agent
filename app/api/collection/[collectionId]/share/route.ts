import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionShares, users } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { isValidSharePermission } from "@/lib/permissions";
import { isFeatureFlagEnabled } from "@/lib/feature-flags/server";
import { recordResearchEvent } from "@/lib/research-telemetry";

// Helper to check if user is owner
async function isOwner(collectionId: string, userId: string): Promise<boolean> {
  const [collection] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);

  return !!collection;
}

async function shareWithSingleUser(
  collectionId: string,
  sharedWithUserId: string,
  permission: string,
  ownerId: string,
) {
  if (sharedWithUserId === ownerId) return null;

  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, sharedWithUserId))
    .limit(1);
  if (!targetUser) return null;

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
    const [updatedShare] = await db
      .update(collectionShares)
      .set({ permission })
      .where(eq(collectionShares.id, existingShare.id))
      .returning();
    return { share: updatedShare, updated: true };
  }

  const [newShare] = await db
    .insert(collectionShares)
    .values({ collectionId, sharedWithUserId, permission })
    .returning();

  if (await isFeatureFlagEnabled(ownerId, "res_telemetry")) {
    recordResearchEvent({
      userId: ownerId,
      eventType: "image_shared",
      metadata: { collectionId, shareType: "collection" },
    });
  }

  return { share: newShare, updated: false };
}

/**
 * POST /api/collection/[collectionId]/share
 * Share collection with one or more users (owner only).
 * Accepts { sharedWithUserId, permission } or { sharedWithUserIds[], permission }.
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

    if (!(await isOwner(collectionId, userId))) {
      return NextResponse.json(
        { error: "Only the owner can share the collection" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { sharedWithUserId, sharedWithUserIds, permission } = body;

    if (!permission || !isValidSharePermission(permission)) {
      return NextResponse.json(
        { error: "permission must be 'viewer' or 'collaborator'" },
        { status: 400 }
      );
    }

    // Bulk share
    if (Array.isArray(sharedWithUserIds) && sharedWithUserIds.length > 0) {
      const results = await Promise.all(
        sharedWithUserIds.map((uid: string) =>
          shareWithSingleUser(collectionId, uid, permission, userId)
        )
      );
      return NextResponse.json({
        shares: results.filter(Boolean),
        bulk: true,
      });
    }

    // Single share (backward-compatible)
    if (!sharedWithUserId) {
      return NextResponse.json(
        { error: "sharedWithUserId or sharedWithUserIds is required" },
        { status: 400 }
      );
    }

    if (sharedWithUserId === userId) {
      return NextResponse.json(
        { error: "Cannot share collection with yourself" },
        { status: 400 }
      );
    }

    const result = await shareWithSingleUser(collectionId, sharedWithUserId, permission, userId);
    if (!result) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error sharing collection:", error);
    return NextResponse.json(
      { error: "Failed to share collection" },
      { status: 500 }
    );
  }
}

