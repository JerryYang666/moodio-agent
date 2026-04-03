import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  getFolderPermission,
  getFolderBreadcrumbs,
} from "@/lib/folder-utils";

/**
 * GET /api/folders/[folderId]/breadcrumbs
 * Return the ancestor chain for breadcrumb navigation.
 * Response: { projectId: string, breadcrumbs: [{ id, name, type: 'collection' | 'folder' }, ...] }
 */
export async function GET(
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
    if (!permission) {
      return NextResponse.json(
        { error: "Folder not found or access denied" },
        { status: 404 }
      );
    }

    const result = await getFolderBreadcrumbs(folderId);
    if (!result) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching breadcrumbs:", error);
    return NextResponse.json(
      { error: "Failed to fetch breadcrumbs" },
      { status: 500 }
    );
  }
}
