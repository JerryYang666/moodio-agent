import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionShares } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, or, and, desc } from "drizzle-orm";
import { ensureDefaultProject } from "@/lib/db/projects";
import { projects } from "@/lib/db/schema";

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
    await ensureDefaultProject(userId);

    // Get collections owned by user
    const ownedCollections = await db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.updatedAt));

    // Get collections shared with user
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

    // Format response
    const owned = ownedCollections.map((col) => ({
      ...col,
      permission: "owner" as const,
      isOwner: true,
    }));

    const shared = sharedCollectionsData.map((item) => ({
      ...item.collection,
      permission: item.permission,
      isOwner: false,
      sharedAt: item.sharedAt,
    }));

    return NextResponse.json({
      collections: [...owned, ...shared],
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
    const { name, projectId } = body as { name?: unknown; projectId?: unknown };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Collection name is required" },
        { status: 400 }
      );
    }

    const resolvedProjectId =
      typeof projectId === "string" && projectId.trim()
        ? projectId.trim()
        : (await ensureDefaultProject(userId)).id;

    // Projects are not shareable; only allow creating collections in owned projects.
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

    // Create collection
    const [newCollection] = await db
      .insert(collections)
      .values({
        userId,
        projectId: resolvedProjectId,
        name: name.trim(),
      })
      .returning();

    return NextResponse.json({
      collection: {
        ...newCollection,
        permission: "owner",
        isOwner: true,
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

