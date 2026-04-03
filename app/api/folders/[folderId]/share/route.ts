import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders, folderShares, users } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { isValidSharePermission } from "@/lib/permissions";

async function isFolderOwner(
  folderId: string,
  userId: string
): Promise<boolean> {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .limit(1);

  return !!folder;
}

/**
 * POST /api/folders/[folderId]/share
 * Share folder with a user (owner only)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
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
    const { folderId } = await params;

    if (!(await isFolderOwner(folderId, userId))) {
      return NextResponse.json(
        { error: "Only the owner can share the folder" },
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

    if (!isValidSharePermission(permission)) {
      return NextResponse.json(
        { error: "permission must be 'viewer' or 'collaborator'" },
        { status: 400 }
      );
    }

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

    if (sharedWithUserId === userId) {
      return NextResponse.json(
        { error: "Cannot share folder with yourself" },
        { status: 400 }
      );
    }

    const [existingShare] = await db
      .select()
      .from(folderShares)
      .where(
        and(
          eq(folderShares.folderId, folderId),
          eq(folderShares.sharedWithUserId, sharedWithUserId)
        )
      )
      .limit(1);

    if (existingShare) {
      const [updatedShare] = await db
        .update(folderShares)
        .set({ permission })
        .where(eq(folderShares.id, existingShare.id))
        .returning();

      return NextResponse.json({ share: updatedShare, updated: true });
    }

    const [newShare] = await db
      .insert(folderShares)
      .values({
        folderId,
        sharedWithUserId,
        permission,
      })
      .returning();

    return NextResponse.json({ share: newShare, updated: false });
  } catch (error) {
    console.error("Error sharing folder:", error);
    return NextResponse.json(
      { error: "Failed to share folder" },
      { status: 500 }
    );
  }
}
