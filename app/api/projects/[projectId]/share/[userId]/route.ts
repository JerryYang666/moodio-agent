import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, projectShares } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";

// Helper to check if user is owner
async function isOwner(projectId: string, userId: string): Promise<boolean> {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  return !!project;
}

/**
 * DELETE /api/projects/[projectId]/share/[userId]
 * Remove user's access to project (owner only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; userId: string }> }
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

    const currentUserId = payload.userId;
    const { projectId, userId: targetUserId } = await params;

    // Check if user is owner
    if (!(await isOwner(projectId, currentUserId))) {
      return NextResponse.json(
        { error: "Only the owner can remove access" },
        { status: 403 }
      );
    }

    // Remove share
    const result = await db
      .delete(projectShares)
      .where(
        and(
          eq(projectShares.projectId, projectId),
          eq(projectShares.sharedWithUserId, targetUserId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Share not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing share:", error);
    return NextResponse.json(
      { error: "Failed to remove share" },
      { status: 500 }
    );
  }
}
