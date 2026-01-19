import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages, collectionShares, collections, projects } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, eq } from "drizzle-orm";
import { getImageUrl } from "@/lib/storage/s3";

/**
 * GET /api/assets/[assetId]
 * Fetch a single asset if the user can access it.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
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
    const { assetId } = await params;

    const [asset] = await db
      .select()
      .from(collectionImages)
      .where(eq(collectionImages.id, assetId))
      .limit(1);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Owner access via project ownership
    const [ownedProject] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, asset.projectId), eq(projects.userId, userId)))
      .limit(1);

    let canAccess = !!ownedProject;

    // Shared access via collection share (collectionId must be set)
    if (!canAccess && asset.collectionId) {
      const [shared] = await db
        .select({ id: collectionShares.id })
        .from(collectionShares)
        .where(
          and(
            eq(collectionShares.collectionId, asset.collectionId),
            eq(collectionShares.sharedWithUserId, userId)
          )
        )
        .limit(1);

      if (shared) canAccess = true;
    }

    // Also allow if user owns the collection directly (defensive)
    if (!canAccess && asset.collectionId) {
      const [ownedCollection] = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, asset.collectionId), eq(collections.userId, userId)))
        .limit(1);
      if (ownedCollection) canAccess = true;
    }

    if (!canAccess) {
      return NextResponse.json(
        { error: "Asset not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      asset: {
        ...asset,
        imageUrl: getImageUrl(asset.imageId),
      },
    });
  } catch (error) {
    console.error("Error fetching asset:", error);
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: 500 }
    );
  }
}


