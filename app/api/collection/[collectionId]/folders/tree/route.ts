import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";
import { getUserPermission } from "@/lib/collection-utils";

/**
 * GET /api/collection/[collectionId]/folders/tree
 * Returns a flat array of ALL folders in a collection, sorted by path (natural tree order).
 * Used by the LocationPicker to build a full tree without multiple round-trips.
 */
export async function GET(
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

    const permission = await getUserPermission(collectionId, userId);
    if (!permission) {
      return NextResponse.json(
        { error: "Collection not found or access denied" },
        { status: 404 }
      );
    }

    const result = await db
      .select({
        id: folders.id,
        name: folders.name,
        parentId: folders.parentId,
        depth: folders.depth,
      })
      .from(folders)
      .where(eq(folders.collectionId, collectionId))
      .orderBy(folders.path);

    return NextResponse.json({ folders: result });
  } catch (error) {
    console.error("Error fetching folder tree:", error);
    return NextResponse.json(
      { error: "Failed to fetch folder tree" },
      { status: 500 }
    );
  }
}
