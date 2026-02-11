import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { desc, eq, sql } from "drizzle-orm";
import { ensureDefaultProject } from "@/lib/db/projects";
import { getImageUrl } from "@/lib/storage/s3";

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

    // Create a map of projectId -> coverImageUrl (first/most recent for each project)
    const coverMap = new Map<string, string>();
    for (const cover of coverImages) {
      if (!coverMap.has(cover.projectId)) {
        coverMap.set(cover.projectId, getImageUrl(cover.imageId));
      }
    }

    // Add cover image URL to each project
    const projectsWithCovers = rows.map((project) => ({
      ...project,
      coverImageUrl: coverMap.get(project.id) || null,
    }));

    return NextResponse.json({ projects: projectsWithCovers });
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


