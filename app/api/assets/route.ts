import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  collectionImages,
  collectionShares,
  projects,
  projectShares,
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getImageUrl, getVideoUrl, getAudioUrl } from "@/lib/storage/s3";
import { getContentUrl } from "@/lib/config/video.config";
import { ensureDefaultProject } from "@/lib/db/projects";
import { getUserPermission } from "@/lib/collection-utils";
import { getProjectPermission } from "@/lib/project-utils";
import { getUserSetting } from "@/lib/user-settings/server";

function enrichAssetUrls(asset: { assetType: string; imageId: string; assetId: string }, cnMode: boolean = false) {
  if (asset.assetType === "public_image") {
    return { imageUrl: getContentUrl(asset.assetId, cnMode) };
  }
  if (asset.assetType === "public_video") {
    return { imageUrl: "", videoUrl: getContentUrl(asset.assetId, cnMode) };
  }

  if (asset.assetType === "audio") {
    return { imageUrl: "", audioUrl: getAudioUrl(asset.assetId, cnMode) };
  }

  const imageUrl = getImageUrl(asset.imageId, cnMode);
  if (asset.assetType === "video") {
    return { imageUrl, videoUrl: getVideoUrl(asset.assetId, cnMode) };
  }
  return { imageUrl };
}

function parseLimit(value: string | null, fallback: number) {
  const n = value ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 200);
}

function parseOffset(value: string | null) {
  const n = value ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * GET /api/assets
 * List assets user can access.
 * - Owned: asset belongs to a project the user owns
 * - Shared: asset belongs to a directly shared collection or a shared project
 * Filters:
 * - projectId? (owned or shared)
 * - collectionId? (owned, directly shared, or inherited via project share)
 * - limit?
 * - offset?
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
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const collectionId = url.searchParams.get("collectionId") || undefined;
    const folderId = url.searchParams.get("folderId") || undefined;
    const folderRoot = url.searchParams.get("folderRoot") === "true";
    const limit = parseLimit(url.searchParams.get("limit"), 60);
    const offset = parseOffset(url.searchParams.get("offset"));

    // If filtering by a specific collection, verify access first.
    if (collectionId) {
      const permission = await getUserPermission(collectionId, userId);
      if (!permission) {
        return NextResponse.json(
          { error: "Collection not found or access denied" },
          { status: 404 }
        );
      }

      const conditions = [eq(collectionImages.collectionId, collectionId)];
      if (folderId) {
        conditions.push(eq(collectionImages.folderId, folderId));
      } else if (folderRoot) {
        conditions.push(isNull(collectionImages.folderId));
      }

      const rows = await db
        .select()
        .from(collectionImages)
        .where(and(...conditions))
        .orderBy(desc(collectionImages.addedAt), desc(collectionImages.id))
        .offset(offset)
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;

      const assets = pageRows.map((a) => ({
        ...a,
        ...enrichAssetUrls(a, cnMode),
      }));

      return NextResponse.json({
        assets,
        hasMore,
        nextOffset: hasMore ? offset + pageRows.length : null,
      });
    }

    // If filtering by projectId, allow owned or shared projects.
    if (projectId) {
      const permission = await getProjectPermission(projectId, userId);
      if (!permission) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 }
        );
      }

      const rows = await db
        .select()
        .from(collectionImages)
        .where(eq(collectionImages.projectId, projectId))
        .orderBy(desc(collectionImages.addedAt), desc(collectionImages.id))
        .offset(offset)
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;

      const assets = pageRows.map((a) => ({
        ...a,
        ...enrichAssetUrls(a, cnMode),
      }));

      return NextResponse.json({
        assets,
        hasMore,
        nextOffset: hasMore ? offset + pageRows.length : null,
      });
    }

    // No filters: return recent accessible assets (owned + shared).
    const ownedProjectIdsRows = await db
      .select({ projectId: projects.id })
      .from(projects)
      .where(eq(projects.userId, userId));
    const sharedProjectIdsRows = await db
      .select({ projectId: projectShares.projectId })
      .from(projectShares)
      .where(eq(projectShares.sharedWithUserId, userId));
    const accessibleProjectIds = Array.from(
      new Set([
        ...ownedProjectIdsRows.map((r) => r.projectId),
        ...sharedProjectIdsRows.map((r) => r.projectId),
      ])
    );

    const sharedCollectionIdsRows = await db
      .select({ collectionId: collectionShares.collectionId })
      .from(collectionShares)
      .where(eq(collectionShares.sharedWithUserId, userId));
    const directSharedCollectionIds = sharedCollectionIdsRows.map((r) => r.collectionId);

    const hasProjectAccess = accessibleProjectIds.length > 0;
    const hasDirectCollectionAccess = directSharedCollectionIds.length > 0;

    if (!hasProjectAccess && !hasDirectCollectionAccess) {
      return NextResponse.json({ assets: [], hasMore: false, nextOffset: null });
    }

    const whereClause = hasProjectAccess && hasDirectCollectionAccess
      ? or(
          inArray(collectionImages.projectId, accessibleProjectIds),
          inArray(collectionImages.collectionId, directSharedCollectionIds)
        )
      : hasProjectAccess
        ? inArray(collectionImages.projectId, accessibleProjectIds)
        : inArray(collectionImages.collectionId, directSharedCollectionIds);
    const rows = await db
      .select()
      .from(collectionImages)
      .where(whereClause)
      .orderBy(desc(collectionImages.addedAt), desc(collectionImages.id))
      .offset(offset)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const assets = pageRows.map((a) => ({
      ...a,
      ...enrichAssetUrls(a, cnMode),
    }));

    return NextResponse.json({
      assets,
      hasMore,
      nextOffset: hasMore ? offset + pageRows.length : null,
    });
  } catch (error) {
    console.error("Error fetching assets:", error);
    return NextResponse.json(
      { error: "Failed to fetch assets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/assets
 * Save an image as a project-root asset (collectionId = null).
 * Accepts optional projectId; if omitted, uses user's default project.
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
    const {
      imageId,
      chatId,
      generationDetails,
      projectId,
    }: {
      imageId?: unknown;
      chatId?: unknown;
      generationDetails?: unknown;
      projectId?: unknown;
    } = body || {};

    if (!imageId || typeof imageId !== "string") {
      return NextResponse.json({ error: "imageId is required" }, { status: 400 });
    }
    if (!generationDetails) {
      return NextResponse.json(
        { error: "generationDetails is required" },
        { status: 400 }
      );
    }

    const resolvedProjectId =
      typeof projectId === "string" && projectId.trim()
        ? projectId.trim()
        : (await ensureDefaultProject(userId)).id;

    // Projects are not shareable: only allow saving into owned projects.
    const [ownedProject] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, resolvedProjectId), eq(projects.userId, userId)))
      .limit(1);

    if (!ownedProject) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Avoid duplicates in project root.
    const [existing] = await db
      .select({ id: collectionImages.id })
      .from(collectionImages)
      .where(
        and(
          eq(collectionImages.projectId, resolvedProjectId),
          eq(collectionImages.imageId, imageId),
          isNull(collectionImages.collectionId)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Asset already exists in this project" },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(collectionImages)
      .values({
        projectId: resolvedProjectId,
        collectionId: null,
        imageId,
        assetId: imageId, // For images, assetId = imageId
        assetType: "image",
        chatId: typeof chatId === "string" ? chatId : null,
        generationDetails,
      })
      .returning();

    const cnModePost = await getUserSetting(userId, "cnMode");
    return NextResponse.json({
      asset: {
        ...created,
        imageUrl: getImageUrl(created.imageId, cnModePost),
      },
    });
  } catch (error) {
    console.error("Error creating asset:", error);
    return NextResponse.json(
      { error: "Failed to create asset" },
      { status: 500 }
    );
  }
}


