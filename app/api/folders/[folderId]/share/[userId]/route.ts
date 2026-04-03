import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders, folderShares } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";

/**
 * DELETE /api/folders/[folderId]/share/[userId]
 * Revoke a user's access to a folder (owner only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string; userId: string }> }
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
    const { folderId, userId: targetUserId } = await params;

    // Check if current user is the folder owner
    const [folder] = await db
      .select()
      .from(folders)
      .where(
        and(eq(folders.id, folderId), eq(folders.userId, currentUserId))
      )
      .limit(1);

    if (!folder) {
      return NextResponse.json(
        { error: "Only the owner can manage folder shares" },
        { status: 403 }
      );
    }

    const result = await db
      .delete(folderShares)
      .where(
        and(
          eq(folderShares.folderId, folderId),
          eq(folderShares.sharedWithUserId, targetUserId)
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
    console.error("Error revoking folder share:", error);
    return NextResponse.json(
      { error: "Failed to revoke folder share" },
      { status: 500 }
    );
  }
}
