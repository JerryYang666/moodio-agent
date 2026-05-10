import { NextRequest, NextResponse } from "next/server";
import { isOwner, hasWriteAccess, type SharePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  desktops,
  desktopAssets,
  desktopShares,
  users,
  videoGenerations,
  type DesktopShare,
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, desc, inArray } from "drizzle-orm";
import { getDesktopPermission } from "@/lib/desktop/permissions";
import { getImageUrl, getVideoUrl, getSignedVideoUrl, getThumbnailUrl } from "@/lib/storage/s3";
import { getContentUrl, getVideoUrl as getPublicVideoUrl } from "@/lib/config/video.config";
import { getUserSetting } from "@/lib/user-settings/server";

/**
 * GET /api/desktop/[id]
 * Get desktop details with assets and shares
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

    const cnMode = await getUserSetting(payload.userId, "cnMode");
    const { id } = await params;
    const permission = await getDesktopPermission(id, payload.userId);
    if (!permission) {
      return NextResponse.json(
        { error: "Desktop not found or access denied" },
        { status: 404 }
      );
    }

    const [desktop] = await db
      .select()
      .from(desktops)
      .where(eq(desktops.id, id))
      .limit(1);

    if (!desktop) {
      return NextResponse.json({ error: "Desktop not found" }, { status: 404 });
    }

    const rawAssets = await db
      .select()
      .from(desktopAssets)
      .where(eq(desktopAssets.desktopId, id))
      .orderBy(desc(desktopAssets.addedAt));

    // Collect generationIds for video assets that need enrichment
    const generationIds = rawAssets
      .filter((a) => a.assetType === "video")
      .map((a) => {
        const m = a.metadata as Record<string, unknown>;
        return typeof m.generationId === "string" ? m.generationId : null;
      })
      .filter(Boolean) as string[];

    let generationMap = new Map<string, any>();
    if (generationIds.length > 0) {
      const generations = await db
        .select()
        .from(videoGenerations)
        .where(inArray(videoGenerations.id, generationIds));
      generationMap = new Map(generations.map((g) => [g.id, g]));
    }

    const assets = rawAssets.map((asset) => {
      const meta = asset.metadata as Record<string, unknown>;
      const imageId = typeof meta.imageId === "string" ? meta.imageId : null;
      let videoId = typeof meta.videoId === "string" ? meta.videoId : null;

      let generationData: Record<string, unknown> | undefined;
      if (asset.assetType === "video" && typeof meta.generationId === "string") {
        const gen = generationMap.get(meta.generationId);
        if (gen) {
          if (!videoId && gen.videoId) {
            videoId = gen.videoId;
          }
          generationData = {
            generationId: gen.id,
            status: gen.status,
            videoId: gen.videoId,
            modelId: gen.modelId,
            params: gen.params,
            error: gen.error,
            createdAt: gen.createdAt,
            completedAt: gen.completedAt,
          };
        }
      }

      if (asset.assetType === "public_video") {
        const storageKey = typeof meta.storageKey === "string" ? meta.storageKey : null;
        return {
          ...asset,
          imageUrl: null,
          videoUrl: storageKey ? getPublicVideoUrl(storageKey, cnMode) : null,
          generationData: null,
        };
      }

      if (asset.assetType === "public_image") {
        const storageKey = typeof meta.storageKey === "string" ? meta.storageKey : null;
        return {
          ...asset,
          imageUrl: storageKey ? getContentUrl(storageKey, cnMode) : null,
          videoUrl: null,
          generationData: null,
        };
      }

      return {
        ...asset,
        imageUrl: imageId ? getImageUrl(imageId, cnMode) : null,
        thumbnailSmUrl: imageId ? getThumbnailUrl(imageId, "sm", cnMode) : null,
        thumbnailMdUrl: imageId ? getThumbnailUrl(imageId, "md", cnMode) : null,
        videoUrl: asset.assetType === "video" && videoId ? getVideoUrl(videoId, cnMode) : null,
        // CORS-friendly signed URL for client-side frame capture.
        signedVideoUrl:
          asset.assetType === "video" && videoId
            ? getSignedVideoUrl(videoId, undefined, cnMode)
            : null,
        generationData,
      };
    });

    let shares: (DesktopShare & { email: string })[] = [];
    if (isOwner(permission)) {
      const sharesData = await db
        .select({
          id: desktopShares.id,
          desktopId: desktopShares.desktopId,
          sharedWithUserId: desktopShares.sharedWithUserId,
          permission: desktopShares.permission,
          sharedAt: desktopShares.sharedAt,
          email: users.email,
        })
        .from(desktopShares)
        .innerJoin(users, eq(desktopShares.sharedWithUserId, users.id))
        .where(eq(desktopShares.desktopId, id));

      shares = sharesData.map((s) => ({
        id: s.id,
        desktopId: s.desktopId,
        sharedWithUserId: s.sharedWithUserId,
        permission: s.permission as SharePermission,
        sharedAt: s.sharedAt,
        email: s.email,
      }));
    }

    return NextResponse.json({
      desktop: { ...desktop, permission, isOwner: isOwner(permission) },
      assets,
      shares,
    });
  } catch (error) {
    console.error("Error fetching desktop:", error);
    return NextResponse.json(
      { error: "Failed to fetch desktop" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/desktop/[id]
 * Update desktop (name, viewportState). Owner only for name; owner/collaborator for viewportState.
 */
export async function PATCH(
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

    const body = await req.json();
    const { name, viewportState } = body;

    if (name !== undefined && !isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can rename the desktop" },
        { status: 403 }
      );
    }

    if (
      viewportState !== undefined &&
      !hasWriteAccess(permission)
    ) {
      return NextResponse.json(
        { error: "You don't have permission to update this desktop" },
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim();
    }
    if (viewportState !== undefined) {
      updates.viewportState = viewportState;
    }

    const [updated] = await db
      .update(desktops)
      .set(updates)
      .where(eq(desktops.id, id))
      .returning();

    return NextResponse.json({
      desktop: { ...updated, permission, isOwner: isOwner(permission) },
    });
  } catch (error) {
    console.error("Error updating desktop:", error);
    return NextResponse.json(
      { error: "Failed to update desktop" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/desktop/[id]
 * Delete desktop (owner only, cascade deletes assets & shares)
 */
export async function DELETE(
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
    if (!isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can delete the desktop" },
        { status: 403 }
      );
    }

    await db.delete(desktops).where(eq(desktops.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting desktop:", error);
    return NextResponse.json(
      { error: "Failed to delete desktop" },
      { status: 500 }
    );
  }
}
