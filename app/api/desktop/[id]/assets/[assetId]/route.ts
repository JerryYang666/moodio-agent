import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktopAssets } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { getDesktopPermission } from "@/lib/desktop/permissions";
import { hasWriteAccess } from "@/lib/permissions";
import { getImageUrl, getVideoUrl, getAudioUrl } from "@/lib/storage/s3";
import { getContentUrl } from "@/lib/config/video.config";
import { getUserSetting } from "@/lib/user-settings/server";

function enrichAsset(
  asset: typeof desktopAssets.$inferSelect,
  cnMode: boolean = false
) {
  const meta = asset.metadata as Record<string, unknown>;
  const storageKey = typeof meta.storageKey === "string" ? meta.storageKey : null;
  const imageId = typeof meta.imageId === "string" ? meta.imageId : null;
  const videoId = typeof meta.videoId === "string" ? meta.videoId : null;
  const audioId = typeof meta.audioId === "string" ? meta.audioId : null;
  if (asset.assetType === "public_video") {
    return {
      ...asset,
      imageUrl: null,
      videoUrl: storageKey ? getContentUrl(storageKey, cnMode) : null,
    };
  }
  if (asset.assetType === "public_image") {
    return {
      ...asset,
      imageUrl: storageKey ? getContentUrl(storageKey, cnMode) : null,
      videoUrl: null,
    };
  }
  if (asset.assetType === "audio") {
    return {
      ...asset,
      imageUrl: null,
      audioUrl: audioId ? getAudioUrl(audioId, cnMode) : null,
    };
  }
  return {
    ...asset,
    imageUrl: imageId ? getImageUrl(imageId, cnMode) : null,
    videoUrl: asset.assetType === "video" && videoId ? getVideoUrl(videoId, cnMode) : null,
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

    const cnMode = await getUserSetting(payload.userId, "cnMode");
    const { id, assetId } = await params;
    const permission = await getDesktopPermission(id, payload.userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to modify assets on this desktop" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Cell-level patch for table assets (read-modify-write a single cell)
    if (body.cellPatch && typeof body.cellPatch === "object") {
      const { rowId, colIndex, value } = body.cellPatch;
      if (typeof rowId !== "string" || typeof colIndex !== "number" || typeof value !== "string") {
        return NextResponse.json({ error: "cellPatch requires rowId (string), colIndex (number), and value (string)" }, { status: 400 });
      }

      const [existing] = await db
        .select()
        .from(desktopAssets)
        .where(and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id)));

      if (!existing) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      if (existing.assetType !== "table") {
        return NextResponse.json({ error: "cellPatch is only supported for table assets" }, { status: 400 });
      }

      const meta = existing.metadata as Record<string, unknown>;
      const rows = Array.isArray(meta.rows) ? [...meta.rows] : [];
      const rowIndex = rows.findIndex((r: any) => r.id === rowId);
      if (rowIndex === -1) {
        return NextResponse.json({ error: `Row ${rowId} not found` }, { status: 404 });
      }

      const row = { ...rows[rowIndex] } as any;
      const cells = Array.isArray(row.cells) ? [...row.cells] : [];
      if (colIndex < 0 || colIndex >= cells.length) {
        return NextResponse.json({ error: `Column index ${colIndex} out of range` }, { status: 400 });
      }

      cells[colIndex] = { ...cells[colIndex], value };
      row.cells = cells;
      rows[rowIndex] = row;

      const patchedMetadata = { ...meta, rows };

      const [updated] = await db
        .update(desktopAssets)
        .set({ metadata: patchedMetadata })
        .where(and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id)))
        .returning();

      if (!updated) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      return NextResponse.json({ asset: enrichAsset(updated, cnMode) });
    }

    // Video suggest patch (read-modify-write title/videoIdea fields)
    if (body.videoSuggestPatch && typeof body.videoSuggestPatch === "object") {
      const { title, videoIdea } = body.videoSuggestPatch;

      const [existing] = await db
        .select()
        .from(desktopAssets)
        .where(and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id)));

      if (!existing) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      if (existing.assetType !== "video_suggest") {
        return NextResponse.json({ error: "videoSuggestPatch is only supported for video_suggest assets" }, { status: 400 });
      }

      const meta = existing.metadata as Record<string, unknown>;
      const patchedMetadata = { ...meta };
      if (typeof title === "string") patchedMetadata.title = title;
      if (typeof videoIdea === "string") patchedMetadata.videoIdea = videoIdea;

      const [updated] = await db
        .update(desktopAssets)
        .set({ metadata: patchedMetadata })
        .where(and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id)))
        .returning();

      if (!updated) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      return NextResponse.json({ asset: enrichAsset(updated, cnMode) });
    }

    // Text content patch for text assets (read-modify-write the content field)
    if (body.textPatch && typeof body.textPatch === "object") {
      const { content } = body.textPatch;
      if (typeof content !== "string") {
        return NextResponse.json({ error: "textPatch requires content (string)" }, { status: 400 });
      }

      const [existing] = await db
        .select()
        .from(desktopAssets)
        .where(and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id)));

      if (!existing) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      if (existing.assetType !== "text") {
        return NextResponse.json({ error: "textPatch is only supported for text assets" }, { status: 400 });
      }

      const patchedMetadata = { ...(existing.metadata as Record<string, unknown>), content };

      const [updated] = await db
        .update(desktopAssets)
        .set({ metadata: patchedMetadata })
        .where(and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id)))
        .returning();

      if (!updated) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      return NextResponse.json({ asset: enrichAsset(updated, cnMode) });
    }

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

    return NextResponse.json({ asset: enrichAsset(updated, cnMode) });
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
    if (!hasWriteAccess(permission)) {
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
