import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages, collections, projects } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getImageUrl } from "@/lib/storage/s3";

/**
 * GET /api/projects/[projectId]
 * Get project detail (owner only) + collections under it + recent root assets
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
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

    return NextResponse.json({
      project,
      collections: projectCollections,
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


