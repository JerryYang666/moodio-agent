import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders, folderShares, collections } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";

/**
 * GET /api/folders/shared
 * Returns all folders directly shared with the current user.
 * Includes parent collection context so the UI can show where each folder lives.
 */
export async function GET(req: NextRequest) {
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

    const result = await db
      .select({
        id: folders.id,
        name: folders.name,
        collectionId: folders.collectionId,
        collectionName: collections.name,
        permission: folderShares.permission,
        sharedAt: folderShares.sharedAt,
      })
      .from(folderShares)
      .innerJoin(folders, eq(folderShares.folderId, folders.id))
      .innerJoin(collections, eq(folders.collectionId, collections.id))
      .where(eq(folderShares.sharedWithUserId, userId))
      .orderBy(folderShares.sharedAt);

    return NextResponse.json({ folders: result });
  } catch (error) {
    console.error("Error fetching shared folders:", error);
    return NextResponse.json(
      { error: "Failed to fetch shared folders" },
      { status: 500 }
    );
  }
}
