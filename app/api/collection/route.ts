import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionShares, collectionImages, collectionTags, projects, projectShares } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, or, and, desc, sql } from "drizzle-orm";
import { ensureDefaultProject } from "@/lib/db/projects";
import { getImageUrl } from "@/lib/storage/s3";
import { getContentUrl } from "@/lib/config/video.config";
import { getProjectPermission, hasProjectWritePermission } from "@/lib/project-utils";
import { PERMISSION_OWNER } from "@/lib/permissions";
import { TAG_COLOR_MAP } from "@/lib/tag-colors";
import { getUserSetting } from "@/lib/user-settings/server";

/**
 * GET /api/collection
 * List all collections (owned + shared with user)
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
    const cnMode = await getUserSetting(userId, "cnMode");
    await ensureDefaultProject(userId);

    // Get collections owned by user
    const ownedCollections = await db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.updatedAt));

    // Get collections shared with user (direct collection shares)
    const sharedCollectionsData = await db
      .select({
        collection: collections,
        permission: collectionShares.permission,
        sharedAt: collectionShares.sharedAt,
      })
      .from(collectionShares)
      .innerJoin(collections, eq(collectionShares.collectionId, collections.id))
      .where(eq(collectionShares.sharedWithUserId, userId))
      .orderBy(desc(collectionShares.sharedAt));

    // Get collections inherited from shared projects
    const projectSharedCollections = await db
      .select({
        collection: collections,
        permission: projectShares.permission,
        sharedAt: projectShares.sharedAt,
      })
      .from(projectShares)
      .innerJoin(collections, eq(collections.projectId, projectShares.projectId))
      .where(eq(projectShares.sharedWithUserId, userId))
      .orderBy(desc(projectShares.sharedAt));

    // Merge: direct collection shares take priority over project-inherited ones
    const directShareIds = new Set(sharedCollectionsData.map((s) => s.collection.id));
    const ownedIds = new Set(ownedCollections.map((c) => c.id));
    const inheritedCollections = projectSharedCollections.filter(
      (s) => !directShareIds.has(s.collection.id) && !ownedIds.has(s.collection.id)
    );

    // Get all collection IDs
    const allCollectionIds = [
      ...ownedCollections.map((c) => c.id),
      ...sharedCollectionsData.map((s) => s.collection.id),
      ...inheritedCollections.map((s) => s.collection.id),
    ];

    // Get cover images for each collection (most recently added asset)
    const coverImages = allCollectionIds.length > 0
      ? await db
          .select({
            collectionId: collectionImages.collectionId,
            imageId: collectionImages.imageId,
            assetId: collectionImages.assetId,
            assetType: collectionImages.assetType,
          })
          .from(collectionImages)
          .where(sql`${collectionImages.collectionId} IN ${allCollectionIds}`)
          .orderBy(desc(collectionImages.addedAt))
      : [];

    // Create a map of collectionId -> coverImageUrl (first/most recent for each collection)
    const coverMap = new Map<string, string>();
    for (const cover of coverImages) {
      if (cover.collectionId && !coverMap.has(cover.collectionId)) {
        if (cover.assetType === "public_video") {
          continue;
        }
        if (cover.assetType === "public_image") {
          coverMap.set(cover.collectionId, getContentUrl(cover.assetId, cnMode));
          continue;
        }
        coverMap.set(cover.collectionId, getImageUrl(cover.imageId, cnMode));
      }
    }

    // Get tags for all collections
    const allTags = allCollectionIds.length > 0
      ? await db
          .select()
          .from(collectionTags)
          .where(sql`${collectionTags.collectionId} IN ${allCollectionIds}`)
          .orderBy(collectionTags.createdAt)
      : [];

    // Create a map of collectionId -> tags
    const tagsMap = new Map<string, { id: string; label: string; color: string }[]>();
    for (const tag of allTags) {
      const arr = tagsMap.get(tag.collectionId) ?? [];
      arr.push({ id: tag.id, label: tag.label, color: tag.color });
      tagsMap.set(tag.collectionId, arr);
    }

    // Format response
    const owned = ownedCollections.map((col) => ({
      ...col,
      permission: PERMISSION_OWNER,
      isOwner: true,
      coverImageUrl: coverMap.get(col.id) || null,
      tags: tagsMap.get(col.id) ?? [],
    }));

    const shared = sharedCollectionsData.map((item) => ({
      ...item.collection,
      permission: item.permission,
      isOwner: false,
      sharedAt: item.sharedAt,
      coverImageUrl: coverMap.get(item.collection.id) || null,
      tags: tagsMap.get(item.collection.id) ?? [],
    }));

    const inherited = inheritedCollections.map((item) => ({
      ...item.collection,
      permission: item.permission,
      isOwner: false,
      sharedAt: item.sharedAt,
      coverImageUrl: coverMap.get(item.collection.id) || null,
      tags: tagsMap.get(item.collection.id) ?? [],
    }));

    return NextResponse.json({
      collections: [...owned, ...shared, ...inherited],
    });
  } catch (error) {
    console.error("Error fetching collections:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/collection
 * Create a new collection
 */
export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const { name, projectId, tags } = body as {
      name?: unknown;
      projectId?: unknown;
      tags?: { label: string; color: string }[];
    };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Collection name is required" },
        { status: 400 }
      );
    }

    // Validate tags if provided
    const validTags: { label: string; color: string }[] = [];
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (
          tag &&
          typeof tag.label === "string" &&
          tag.label.trim() &&
          typeof tag.color === "string" &&
          TAG_COLOR_MAP.has(tag.color)
        ) {
          validTags.push({ label: tag.label.trim().substring(0, 50), color: tag.color });
        }
      }
    }

    const resolvedProjectId =
      typeof projectId === "string" && projectId.trim()
        ? projectId.trim()
        : (await ensureDefaultProject(userId)).id;

    // Check if user has write access (owner or collaborator)
    const projectPermission = await getProjectPermission(resolvedProjectId, userId);
    if (!hasProjectWritePermission(projectPermission)) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Check for duplicate name within the same project
    const trimmedName = name.trim();
    const [existing] = await db
      .select({ id: collections.id })
      .from(collections)
      .where(
        and(
          eq(collections.projectId, resolvedProjectId),
          sql`LOWER(${collections.name}) = LOWER(${trimmedName})`
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "A collection with this name already exists in the project" },
        { status: 409 }
      );
    }

    // Create collection
    const [newCollection] = await db
      .insert(collections)
      .values({
        userId,
        projectId: resolvedProjectId,
        name: trimmedName,
      })
      .returning();

    // Insert tags if provided
    let insertedTags: { id: string; label: string; color: string }[] = [];
    if (validTags.length > 0) {
      insertedTags = (
        await db
          .insert(collectionTags)
          .values(
            validTags.map((t) => ({
              collectionId: newCollection.id,
              label: t.label,
              color: t.color,
            }))
          )
          .returning()
      ).map((t) => ({ id: t.id, label: t.label, color: t.color }));
    }

    return NextResponse.json({
      collection: {
        ...newCollection,
        permission: PERMISSION_OWNER,
        isOwner: true,
        tags: insertedTags,
      },
    });
  } catch (error) {
    console.error("Error creating collection:", error);
    return NextResponse.json(
      { error: "Failed to create collection" },
      { status: 500 }
    );
  }
}

