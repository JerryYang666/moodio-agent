import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages, collections, collectionTags, projects, projectShares, users, type ProjectShare } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getImageUrl, getThumbnailUrl } from "@/lib/storage/s3";
import { getProjectPermission } from "@/lib/project-utils";
import { PERMISSION_OWNER, isOwner, type SharePermission } from "@/lib/permissions";

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

    // Check permission (owner or shared)
    const permission = await getProjectPermission(projectId, userId);
    if (!permission) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
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

    const assetsWithUrls = rootAssets.map((a) => {
      if (a.assetType === "image") {
        return {
          ...a,
          imageUrl: getImageUrl(a.imageId),
          thumbnailSmUrl: getThumbnailUrl(a.imageId, "sm"),
          thumbnailMdUrl: getThumbnailUrl(a.imageId, "md"),
        };
      }
      return {
        ...a,
        imageUrl: getImageUrl(a.imageId),
      };
    });

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

    // Create a map of collectionId -> {coverImageUrl, coverImageMdUrl}
    const coverMap = new Map<string, { full: string; md: string }>();
    for (const cover of coverImages) {
      if (cover.collectionId && !coverMap.has(cover.collectionId)) {
        coverMap.set(cover.collectionId, {
          full: getImageUrl(cover.imageId),
          md: getThumbnailUrl(cover.imageId, "md"),
        });
      }
    }

    // Get tags for all collections
    const allTags = collectionIds.length > 0
      ? await db
          .select()
          .from(collectionTags)
          .where(sql`${collectionTags.collectionId} IN ${collectionIds}`)
          .orderBy(collectionTags.createdAt)
      : [];

    const tagsMap = new Map<string, { id: string; label: string; color: string }[]>();
    for (const tag of allTags) {
      const arr = tagsMap.get(tag.collectionId) ?? [];
      arr.push({ id: tag.id, label: tag.label, color: tag.color });
      tagsMap.set(tag.collectionId, arr);
    }

    // Add cover image URL and tags to each collection
    const collectionsWithCovers = projectCollections.map((col) => {
      const cover = coverMap.get(col.id);
      return {
        ...col,
        coverImageUrl: cover?.full || null,
        coverImageMdUrl: cover?.md || null,
        tags: tagsMap.get(col.id) ?? [],
      };
    });

    // Get shares if user is owner
    let shares: (ProjectShare & { email: string })[] = [];
    if (isOwner(permission)) {
      const sharesData = await db
        .select({
          id: projectShares.id,
          projectId: projectShares.projectId,
          sharedWithUserId: projectShares.sharedWithUserId,
          permission: projectShares.permission,
          sharedAt: projectShares.sharedAt,
          email: users.email,
        })
        .from(projectShares)
        .innerJoin(users, eq(projectShares.sharedWithUserId, users.id))
        .where(eq(projectShares.projectId, projectId));

      shares = sharesData.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        sharedWithUserId: s.sharedWithUserId,
        permission: s.permission as SharePermission,
        sharedAt: s.sharedAt,
        email: s.email,
      }));
    }

    return NextResponse.json({
      project: {
        ...project,
        permission,
        isOwner: isOwner(permission),
      },
      collections: collectionsWithCovers,
      rootAssets: assetsWithUrls,
      shares,
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

    // Verify ownership (only owner can rename)
    const permission = await getProjectPermission(projectId, userId);
    if (!isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can rename the project" },
        { status: 403 }
      );
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


