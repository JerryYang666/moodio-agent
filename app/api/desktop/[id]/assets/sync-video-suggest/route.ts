import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktopAssets } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { getDesktopPermission } from "@/lib/desktop/permissions";
import { hasWriteAccess } from "@/lib/permissions";
import { getImageUrl } from "@/lib/storage/s3";

function enrichAsset(asset: typeof desktopAssets.$inferSelect) {
  const meta = asset.metadata as Record<string, unknown>;
  const imageId = typeof meta.imageId === "string" ? meta.imageId : null;
  return {
    ...asset,
    imageUrl: imageId ? getImageUrl(imageId) : null,
    videoUrl: null,
  };
}

/**
 * PATCH /api/desktop/[id]/assets/sync-video-suggest
 * Sync a video suggest card edit from chat to the matching desktop asset.
 * Finds the asset by messageTimestamp + messageVariantId + partTypeIndex,
 * then updates its title and videoIdea.
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
    if (!hasWriteAccess(permission)) {
      return NextResponse.json(
        { error: "No write access" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { messageTimestamp, messageVariantId, partTypeIndex, updates } = body;

    if (typeof messageTimestamp !== "number" || typeof partTypeIndex !== "number") {
      return NextResponse.json(
        { error: "messageTimestamp and partTypeIndex are required" },
        { status: 400 }
      );
    }

    // Find all video_suggest assets on this desktop
    const allAssets = await db
      .select()
      .from(desktopAssets)
      .where(
        and(
          eq(desktopAssets.desktopId, id),
          eq(desktopAssets.assetType, "video_suggest")
        )
      );

    // Find the one that matches the message pointer
    const target = allAssets.find((a) => {
      const meta = a.metadata as Record<string, unknown>;
      return (
        meta.messageTimestamp === messageTimestamp &&
        (meta.messageVariantId || undefined) === (messageVariantId || undefined) &&
        meta.partTypeIndex === partTypeIndex
      );
    });

    if (!target) {
      // No matching desktop asset — that's fine, user may have deleted it
      return NextResponse.json({ asset: null });
    }

    // Merge updates into existing metadata
    const newMeta = {
      ...(target.metadata as Record<string, unknown>),
      ...updates,
    };

    const [updated] = await db
      .update(desktopAssets)
      .set({ metadata: newMeta })
      .where(eq(desktopAssets.id, target.id))
      .returning();

    return NextResponse.json({ asset: updated ? enrichAsset(updated) : null });
  } catch (error) {
    console.error("Error syncing video suggest to desktop:", error);
    return NextResponse.json(
      { error: "Failed to sync video suggest" },
      { status: 500 }
    );
  }
}
