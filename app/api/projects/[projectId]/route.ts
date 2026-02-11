import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages, collections, projects } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getImageUrl } from "@/lib/storage/s3";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/[projectId]
 * Get project detail (owner only) + collections under it + recent root assets
 */
export async function GET(
  req: NextRequest,
  { params }: RouteContext
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

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectCollections = await db
      .select()
      .from(collections)
      .where(eq(collections.projectId, projectId))
      .orderBy(desc(collections.updatedAt));

    const rootAssets = await db
      .select()
      .from(collectionImages)
      .where(and(eq(collectionImages.projectId, projectId), isNull(collectionImages.collectionId)))
      .orderBy(desc(collectionImages.addedAt))
      .limit(60);

    const assetsWithUrls = rootAssets.map((a) => ({
      ...a,
      imageUrl: getImageUrl(a.imageId),
    }));

    // Get cover images for each collection (most recently added asset)
    const collectionIds = projectCollections.map((c) => c.id);
    const coverImages = collectionIds.length > 0
      ? await db
          .select({
            collectionId: collectionImages.collectionId,
            imageId: collectionImages.imageId,
          })
          .from(collectionImages)
          .where(sql`${collectionImages.collectionId} IN ${collectionIds}`)
          .orderBy(desc(collectionImages.addedAt))
      : [];

    // Create a map of collectionId -> coverImageUrl
    const coverMap = new Map<string, string>();
    for (const cover of coverImages) {
      if (cover.collectionId && !coverMap.has(cover.collectionId)) {
        coverMap.set(cover.collectionId, getImageUrl(cover.imageId));
      }
    }

    // Add cover image URL to each collection
    const collectionsWithCovers = projectCollections.map((col) => ({
      ...col,
      coverImageUrl: coverMap.get(col.id) || null,
    }));

    return NextResponse.json({
      project,
      collections: collectionsWithCovers,
      rootAssets: assetsWithUrls,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[projectId]
 * Rename a project (owner only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
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
    const body = await req.json();
    const { name } = body as { name?: unknown };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Update the project name
    const [updated] = await db
      .update(projects)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();

    return NextResponse.json({ project: updated });
  } catch (error) {
    console.error("Error renaming project:", error);
    return NextResponse.json(
      { error: "Failed to rename project" },
      { status: 500 }
    );
  }
}


