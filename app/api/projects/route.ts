import { NextRequest, NextResponse } from "next/server";
import { PERMISSION_OWNER } from "@/lib/permissions";
import { db } from "@/lib/db";
import { projects, collectionImages, projectShares } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { desc, eq, sql } from "drizzle-orm";
import { ensureDefaultProject } from "@/lib/db/projects";
import { getImageUrl, getThumbnailUrl } from "@/lib/storage/s3";

/**
 * GET /api/projects
 * List projects owned by the user (ensures a default project exists)
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
    await ensureDefaultProject(userId);

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));

    // Get cover images for each project (most recently added asset)
    const projectIds = rows.map((p) => p.id);
    
    // Get the most recent asset for each project
    const coverImages = projectIds.length > 0 
      ? await db
          .select({
            projectId: collectionImages.projectId,
            imageId: collectionImages.imageId,
          })
          .from(collectionImages)
          .where(sql`${collectionImages.projectId} IN ${projectIds}`)
          .orderBy(desc(collectionImages.addedAt))
      : [];

    // Create a map of projectId -> {coverImageUrl, coverImageMdUrl}. The md
    // variant is used for display; the original serves as onError fallback.
    const coverMap = new Map<string, { full: string; md: string }>();
    for (const cover of coverImages) {
      if (!coverMap.has(cover.projectId)) {
        coverMap.set(cover.projectId, {
          full: getImageUrl(cover.imageId),
          md: getThumbnailUrl(cover.imageId, "md"),
        });
      }
    }

    // Add cover image URL to each project
    const projectsWithCovers = rows.map((project) => {
      const cover = coverMap.get(project.id);
      return {
        ...project,
        permission: PERMISSION_OWNER,
        isOwner: true,
        coverImageUrl: cover?.full || null,
        coverImageMdUrl: cover?.md || null,
      };
    });

    // Get projects shared with user
    const sharedProjectsData = await db
      .select({
        project: projects,
        permission: projectShares.permission,
        sharedAt: projectShares.sharedAt,
      })
      .from(projectShares)
      .innerJoin(projects, eq(projectShares.projectId, projects.id))
      .where(eq(projectShares.sharedWithUserId, userId))
      .orderBy(desc(projectShares.sharedAt));

    // Get cover images for shared projects
    const sharedProjectIds = sharedProjectsData.map((s) => s.project.id);
    const sharedCoverImages = sharedProjectIds.length > 0
      ? await db
          .select({
            projectId: collectionImages.projectId,
            imageId: collectionImages.imageId,
          })
          .from(collectionImages)
          .where(sql`${collectionImages.projectId} IN ${sharedProjectIds}`)
          .orderBy(desc(collectionImages.addedAt))
      : [];

    const sharedCoverMap = new Map<string, { full: string; md: string }>();
    for (const cover of sharedCoverImages) {
      if (!sharedCoverMap.has(cover.projectId)) {
        sharedCoverMap.set(cover.projectId, {
          full: getImageUrl(cover.imageId),
          md: getThumbnailUrl(cover.imageId, "md"),
        });
      }
    }

    const sharedProjects = sharedProjectsData.map((item) => {
      const cover = sharedCoverMap.get(item.project.id);
      return {
        ...item.project,
        permission: item.permission,
        isOwner: false,
        sharedAt: item.sharedAt,
        coverImageUrl: cover?.full || null,
        coverImageMdUrl: cover?.md || null,
      };
    });

    return NextResponse.json({
      projects: projectsWithCovers,
      sharedProjects,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * Create a new project
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
    const { name } = body as { name?: unknown };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(projects)
      .values({
        userId,
        name: name.trim(),
        isDefault: false,
      })
      .returning();

    return NextResponse.json({ project: created });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}


