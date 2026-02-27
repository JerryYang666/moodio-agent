import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  desktops,
  desktopAssets,
  desktopShares,
  users,
  type DesktopShare,
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, desc } from "drizzle-orm";
import { getDesktopPermission } from "@/lib/desktop/permissions";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";

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

    let shares: (DesktopShare & { email: string })[] = [];
    if (permission === "owner") {
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
        permission: s.permission as "viewer" | "collaborator",
        sharedAt: s.sharedAt,
        email: s.email,
      }));
    }

    return NextResponse.json({
      desktop: { ...desktop, permission, isOwner: permission === "owner" },
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

    if (name !== undefined && permission !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can rename the desktop" },
        { status: 403 }
      );
    }

    if (
      viewportState !== undefined &&
      permission !== "owner" &&
      permission !== "collaborator"
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
      desktop: { ...updated, permission, isOwner: permission === "owner" },
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
    if (permission !== "owner") {
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
