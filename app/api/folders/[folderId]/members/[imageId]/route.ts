import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getFolderPermission, touchFolder } from "@/lib/folder-utils";
import { hasWriteAccess } from "@/lib/permissions";
import {
  isValidGroupStatus,
  setMemberStatus,
  type GroupStatus,
} from "@/lib/groups/service";

/**
 * PATCH /api/folders/[folderId]/members/[imageId]
 * Update a group member's triage status (candidate | good | final | null).
 *
 * Body: { status: "candidate" | "good" | "final" | null }
 * - imageId is the collection_images.id of the member.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string; imageId: string }> }
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
    const { folderId, imageId } = await params;

    const permission = await getFolderPermission(folderId, userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to update members of this group" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { status } = body as { status?: unknown };

    let resolvedStatus: GroupStatus | null;
    if (status === null) {
      resolvedStatus = null;
    } else if (isValidGroupStatus(status)) {
      resolvedStatus = status;
    } else {
      return NextResponse.json(
        { error: "status must be 'candidate', 'good', 'final', or null" },
        { status: 400 }
      );
    }

    try {
      await setMemberStatus(folderId, imageId, resolvedStatus);
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === "GROUP_MEMBER_NOT_FOUND") {
        return NextResponse.json(
          { error: "Member not found in this group" },
          { status: 404 }
        );
      }
      throw e;
    }

    await touchFolder(folderId);

    return NextResponse.json({ success: true, status: resolvedStatus });
  } catch (error) {
    console.error("Error updating group member status:", error);
    return NextResponse.json(
      { error: "Failed to update member status" },
      { status: 500 }
    );
  }
}
