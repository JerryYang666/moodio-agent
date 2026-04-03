import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktops, desktopShares, users } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { isValidSharePermission } from "@/lib/permissions";

async function isDesktopOwner(desktopId: string, userId: string): Promise<boolean> {
  const [desktop] = await db
    .select()
    .from(desktops)
    .where(and(eq(desktops.id, desktopId), eq(desktops.userId, userId)))
    .limit(1);

  return !!desktop;
}

async function shareDesktopWithSingleUser(
  desktopId: string,
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
    .from(desktopShares)
    .where(
      and(
        eq(desktopShares.desktopId, desktopId),
        eq(desktopShares.sharedWithUserId, sharedWithUserId)
      )
    )
    .limit(1);

  if (existingShare) {
    const [updatedShare] = await db
      .update(desktopShares)
      .set({ permission })
      .where(eq(desktopShares.id, existingShare.id))
      .returning();
    return { share: updatedShare, updated: true };
  }

  const [newShare] = await db
    .insert(desktopShares)
    .values({ desktopId, sharedWithUserId, permission })
    .returning();
  return { share: newShare, updated: false };
}

/**
 * GET /api/desktop/[id]/share
 * List shares for a desktop (owner only)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    if (!(await isDesktopOwner(id, payload.userId))) {
      return NextResponse.json(
        { error: "Only the owner can view shares" },
        { status: 403 }
      );
    }

    const shares = await db
      .select({
        id: desktopShares.id,
        desktopId: desktopShares.desktopId,
        sharedWithUserId: desktopShares.sharedWithUserId,
        permission: desktopShares.permission,
        sharedAt: desktopShares.sharedAt,
        email: users.email,
      })
      .from(desktopShares)
      .innerJoin(users, eq(desktopShares.sharedWithUserId, users.id))
      .where(eq(desktopShares.desktopId, id));

    return NextResponse.json({ shares });
  } catch (error) {
    console.error("Error fetching desktop shares:", error);
    return NextResponse.json(
      { error: "Failed to fetch desktop shares" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/desktop/[id]/share
 * Share desktop with one or more users (owner only).
 * Accepts { sharedWithUserId, permission } or { sharedWithUserIds[], permission }.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const { id } = await params;

    if (!(await isDesktopOwner(id, userId))) {
      return NextResponse.json(
        { error: "Only the owner can share the desktop" },
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
          shareDesktopWithSingleUser(id, uid, permission, userId)
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
        { error: "Cannot share desktop with yourself" },
        { status: 400 }
      );
    }

    const result = await shareDesktopWithSingleUser(id, sharedWithUserId, permission, userId);
    if (!result) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error sharing desktop:", error);
    return NextResponse.json(
      { error: "Failed to share desktop" },
      { status: 500 }
    );
  }
}
