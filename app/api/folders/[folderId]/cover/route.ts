import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getFolderPermission, touchFolder } from "@/lib/folder-utils";
import { hasWriteAccess } from "@/lib/permissions";
import { setGroupCover } from "@/lib/groups/service";

/**
 * PUT /api/folders/[folderId]/cover
 * Set (or clear) the designated cover for a group folder.
 *
 * Body: { collectionImageId: string | null }
 *  - collection_images.id of the member to use as cover, or null to clear.
 *  - The candidate must already be a member of this folder.
 */
export async function PUT(
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

    const permission = await getFolderPermission(folderId, userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to update this group" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { collectionImageId } = body as {
      collectionImageId?: string | null;
    };

    if (collectionImageId !== null && typeof collectionImageId !== "string") {
      return NextResponse.json(
        { error: "collectionImageId must be a string or null" },
        { status: 400 }
      );
    }

    try {
      await setGroupCover(folderId, collectionImageId);
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === "GROUP_COVER_NOT_MEMBER") {
        return NextResponse.json(
          { error: "Cover candidate must be a member of this group" },
          { status: 400 }
        );
      }
      throw e;
    }

    await touchFolder(folderId);

    return NextResponse.json({ success: true, coverImageId: collectionImageId });
  } catch (error) {
    console.error("Error updating group cover:", error);
    return NextResponse.json(
      { error: "Failed to update group cover" },
      { status: 500 }
    );
  }
}
