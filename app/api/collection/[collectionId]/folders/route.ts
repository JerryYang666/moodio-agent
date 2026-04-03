import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders, collections } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and, isNull } from "drizzle-orm";
import { getUserPermission } from "@/lib/collection-utils";
import { hasWriteAccess } from "@/lib/permissions";
import {
  buildFolderPath,
  getFolder,
  validateDepth,
} from "@/lib/folder-utils";

/**
 * GET /api/collection/[collectionId]/folders
 * List top-level folders in a collection (or children of a parent folder via ?parentId=)
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

    const parentId = req.nextUrl.searchParams.get("parentId");

    const condition = parentId
      ? and(
          eq(folders.collectionId, collectionId),
          eq(folders.parentId, parentId)
        )
      : and(
          eq(folders.collectionId, collectionId),
          isNull(folders.parentId)
        );

    const result = await db
      .select()
      .from(folders)
      .where(condition)
      .orderBy(folders.sortOrder, folders.name);

    return NextResponse.json({ folders: result });
  } catch (error) {
    console.error("Error fetching folders:", error);
    return NextResponse.json(
      { error: "Failed to fetch folders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/collection/[collectionId]/folders
 * Create a new folder in a collection, optionally under a parent folder.
 * Body: { name: string, parentId?: string }
 */
export async function POST(
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
    if (!hasWriteAccess(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to create folders in this collection" },
        { status: 403 }
      );
    }

    const [collection] = await db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.id, collectionId))
      .limit(1);

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { name, parentId } = body as { name?: unknown; parentId?: string };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Folder name is required" },
        { status: 400 }
      );
    }

    let parentPath: string | null = null;
    let depth = 0;

    if (parentId) {
      const parent = await getFolder(parentId);
      if (!parent || parent.collectionId !== collectionId) {
        return NextResponse.json(
          { error: "Parent folder not found in this collection" },
          { status: 404 }
        );
      }

      if (!validateDepth(parent.depth)) {
        return NextResponse.json(
          { error: "Maximum folder nesting depth exceeded" },
          { status: 400 }
        );
      }

      parentPath = parent.path;
      depth = parent.depth + 1;
    }

    // Insert with a temporary path, then update with the real one using the generated ID
    const [newFolder] = await db
      .insert(folders)
      .values({
        collectionId,
        parentId: parentId || null,
        userId,
        name: name.trim(),
        path: "temp",
        depth,
      })
      .returning();

    const realPath = buildFolderPath(parentPath, newFolder.id);

    const [updatedFolder] = await db
      .update(folders)
      .set({ path: realPath })
      .where(eq(folders.id, newFolder.id))
      .returning();

    return NextResponse.json({ folder: updatedFolder });
  } catch (error) {
    console.error("Error creating folder:", error);
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}
