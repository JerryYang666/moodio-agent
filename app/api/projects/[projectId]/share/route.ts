import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, projectShares, users } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { isValidSharePermission } from "@/lib/permissions";

// Helper to check if user is owner
async function isOwner(projectId: string, userId: string): Promise<boolean> {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  return !!project;
}

async function shareWithSingleUser(
  projectId: string,
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
    .from(projectShares)
    .where(
      and(
        eq(projectShares.projectId, projectId),
        eq(projectShares.sharedWithUserId, sharedWithUserId)
      )
    )
    .limit(1);

  if (existingShare) {
    const [updatedShare] = await db
      .update(projectShares)
      .set({ permission })
      .where(eq(projectShares.id, existingShare.id))
      .returning();
    return { share: updatedShare, updated: true };
  }

  const [newShare] = await db
    .insert(projectShares)
    .values({ projectId, sharedWithUserId, permission })
    .returning();
  return { share: newShare, updated: false };
}

/**
 * POST /api/projects/[projectId]/share
 * Share project with one or more users (owner only).
 * Accepts { sharedWithUserId, permission } or { sharedWithUserIds[], permission }.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
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
    const { projectId } = await params;

    if (!(await isOwner(projectId, userId))) {
      return NextResponse.json(
        { error: "Only the owner can share the project" },
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
          shareWithSingleUser(projectId, uid, permission, userId)
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
        { error: "Cannot share project with yourself" },
        { status: 400 }
      );
    }

    const result = await shareWithSingleUser(projectId, sharedWithUserId, permission, userId);
    if (!result) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error sharing project:", error);
    return NextResponse.json(
      { error: "Failed to share project" },
      { status: 500 }
    );
  }
}
