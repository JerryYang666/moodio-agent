import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktopAssets } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { getDesktopPermission } from "@/lib/desktop/permissions";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";

function enrichAsset(asset: typeof desktopAssets.$inferSelect) {
  const meta = asset.metadata as Record<string, unknown>;
  const imageId = typeof meta.imageId === "string" ? meta.imageId : null;
  const videoId = typeof meta.videoId === "string" ? meta.videoId : null;
  return {
    ...asset,
    imageUrl: imageId ? getImageUrl(imageId) : null,
    videoUrl: asset.assetType === "video" && videoId ? getVideoUrl(videoId) : null,
  };
}

interface BatchUpdate {
  id: string;
  posX?: number;
  posY?: number;
  width?: number | null;
  height?: number | null;
  rotation?: number;
  zIndex?: number;
}

/**
 * POST /api/desktop/[id]/assets/batch
 * Batch update positions/sizes for multiple assets (e.g. after multi-drag)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const permission = await getDesktopPermission(id, payload.userId);
    if (permission !== "owner" && permission !== "collaborator") {
      return NextResponse.json(
        { error: "You don't have permission to modify assets on this desktop" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updates: BatchUpdate[] = body.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array is required" },
        { status: 400 }
      );
    }

    const results = [];
    for (const update of updates) {
      if (!update.id || typeof update.id !== "string") continue;

      const fields: Record<string, unknown> = {};
      if (typeof update.posX === "number") fields.posX = update.posX;
      if (typeof update.posY === "number") fields.posY = update.posY;
      if (typeof update.width === "number" || update.width === null) fields.width = update.width;
      if (typeof update.height === "number" || update.height === null) fields.height = update.height;
      if (typeof update.rotation === "number") fields.rotation = update.rotation;
      if (typeof update.zIndex === "number") fields.zIndex = update.zIndex;

      if (Object.keys(fields).length === 0) continue;

      const [updated] = await db
        .update(desktopAssets)
        .set(fields)
        .where(
          and(eq(desktopAssets.id, update.id), eq(desktopAssets.desktopId, id))
        )
        .returning();

      if (updated) results.push(enrichAsset(updated));
    }

    return NextResponse.json({ assets: results });
  } catch (error) {
    console.error("Error batch updating desktop assets:", error);
    return NextResponse.json(
      { error: "Failed to batch update desktop assets" },
      { status: 500 }
    );
  }
}
