import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";
import { getImageUrl, getAudioUrl } from "@/lib/storage/s3";
import { getContentUrl } from "@/lib/config/video.config";
import { getUserPermission } from "@/lib/collection-utils";
import { getProjectPermission } from "@/lib/project-utils";

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

    const canAccess = asset.collectionId
      ? Boolean(await getUserPermission(asset.collectionId, userId))
      : Boolean(await getProjectPermission(asset.projectId, userId));

    if (!canAccess) {
      return NextResponse.json(
        { error: "Asset not found or access denied" },
        { status: 404 }
      );
    }

    const enriched = asset.assetType === "audio"
      ? { ...asset, imageUrl: "", audioUrl: getAudioUrl(asset.assetId) }
      : asset.assetType === "public_image"
        ? { ...asset, imageUrl: getContentUrl(asset.assetId) }
        : { ...asset, imageUrl: getImageUrl(asset.imageId) };

    return NextResponse.json({ asset: enriched });
  } catch (error) {
    console.error("Error fetching asset:", error);
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: 500 }
    );
  }
}


