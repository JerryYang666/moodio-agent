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

/**
 * PATCH /api/desktop/[id]/assets/[assetId]
 * Update an asset's position, size, rotation, zIndex, or metadata
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
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

    const { id, assetId } = await params;
    const permission = await getDesktopPermission(id, payload.userId);
    if (permission !== "owner" && permission !== "collaborator") {
      return NextResponse.json(
        { error: "You don't have permission to modify assets on this desktop" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.posX === "number") updates.posX = body.posX;
    if (typeof body.posY === "number") updates.posY = body.posY;
    if (typeof body.width === "number" || body.width === null) updates.width = body.width;
    if (typeof body.height === "number" || body.height === null) updates.height = body.height;
    if (typeof body.rotation === "number") updates.rotation = body.rotation;
    if (typeof body.zIndex === "number") updates.zIndex = body.zIndex;
    if (body.metadata !== undefined && typeof body.metadata === "object") {
      updates.metadata = body.metadata;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(desktopAssets)
      .set(updates)
      .where(
        and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id))
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ asset: enrichAsset(updated) });
  } catch (error) {
    console.error("Error updating desktop asset:", error);
    return NextResponse.json(
      { error: "Failed to update desktop asset" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/desktop/[id]/assets/[assetId]
 * Remove an asset from the desktop
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
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

    const { id, assetId } = await params;
    const permission = await getDesktopPermission(id, payload.userId);
    if (permission !== "owner" && permission !== "collaborator") {
      return NextResponse.json(
        { error: "You don't have permission to remove assets from this desktop" },
        { status: 403 }
      );
    }

    const result = await db
      .delete(desktopAssets)
      .where(
        and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id))
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting desktop asset:", error);
    return NextResponse.json(
      { error: "Failed to delete desktop asset" },
      { status: 500 }
    );
  }
}
