import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktopAssets } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, desc } from "drizzle-orm";
import { getDesktopPermission } from "@/lib/desktop/permissions";
import { validateAssetMetadata } from "@/lib/desktop/types";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";

/**
 * GET /api/desktop/[id]/assets
 * List all assets on a desktop
 */
export async function GET(
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
    if (!permission) {
      return NextResponse.json(
        { error: "Desktop not found or access denied" },
        { status: 404 }
      );
    }

    const rawAssets = await db
      .select()
      .from(desktopAssets)
      .where(eq(desktopAssets.desktopId, id))
      .orderBy(desc(desktopAssets.addedAt));

    const assets = rawAssets.map((asset) => {
      const meta = asset.metadata as Record<string, unknown>;
      const imageId = typeof meta.imageId === "string" ? meta.imageId : null;
      const videoId = typeof meta.videoId === "string" ? meta.videoId : null;
      return {
        ...asset,
        imageUrl: imageId ? getImageUrl(imageId) : null,
        videoUrl: asset.assetType === "video" && videoId ? getVideoUrl(videoId) : null,
      };
    });

    return NextResponse.json({ assets });
  } catch (error) {
    console.error("Error fetching desktop assets:", error);
    return NextResponse.json(
      { error: "Failed to fetch desktop assets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/desktop/[id]/assets
 * Add one or more assets to a desktop (owner or collaborator)
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
        { error: "You don't have permission to add assets to this desktop" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const rawAssets = Array.isArray(body.assets) ? body.assets : [body];

    if (rawAssets.length === 0) {
      return NextResponse.json({ error: "No assets provided" }, { status: 400 });
    }

    const valuesToInsert = [];
    for (const raw of rawAssets) {
      const validation = validateAssetMetadata(raw.assetType, raw.metadata);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      if (typeof raw.posX !== "number" || typeof raw.posY !== "number") {
        return NextResponse.json(
          { error: "posX and posY are required numbers" },
          { status: 400 }
        );
      }

      valuesToInsert.push({
        desktopId: id,
        assetType: validation.assetType,
        metadata: raw.metadata,
        posX: raw.posX,
        posY: raw.posY,
        width: typeof raw.width === "number" ? raw.width : null,
        height: typeof raw.height === "number" ? raw.height : null,
        rotation: typeof raw.rotation === "number" ? raw.rotation : 0,
        zIndex: typeof raw.zIndex === "number" ? raw.zIndex : 0,
      });
    }

    const inserted = await db
      .insert(desktopAssets)
      .values(valuesToInsert)
      .returning();

    const enriched = inserted.map((asset) => {
      const meta = asset.metadata as Record<string, unknown>;
      const imgId = typeof meta.imageId === "string" ? meta.imageId : null;
      const vidId = typeof meta.videoId === "string" ? meta.videoId : null;
      return {
        ...asset,
        imageUrl: imgId ? getImageUrl(imgId) : null,
        videoUrl: asset.assetType === "video" && vidId ? getVideoUrl(vidId) : null,
      };
    });

    return NextResponse.json({ assets: enriched });
  } catch (error) {
    console.error("Error adding desktop assets:", error);
    return NextResponse.json(
      { error: "Failed to add desktop assets" },
      { status: 500 }
    );
  }
}
