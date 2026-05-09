import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktopAssets } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { getDesktopPermission } from "@/lib/desktop/permissions";
import { getImageUrl, getThumbnailUrl } from "@/lib/storage/s3";
import { getUserSetting } from "@/lib/user-settings/server";
import {
  normalizeImageHistory,
  type ImageHistoryOperation,
} from "@/lib/desktop/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
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
  if (!permission) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cnMode = await getUserSetting(payload.userId, "cnMode");

  const [asset] = await db
    .select()
    .from(desktopAssets)
    .where(and(eq(desktopAssets.id, assetId), eq(desktopAssets.desktopId, id)));

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (asset.assetType !== "image") {
    return NextResponse.json(
      { error: "Only image assets have edit history" },
      { status: 400 }
    );
  }

  const meta = asset.metadata as Record<string, unknown>;
  const currentImageId = typeof meta.imageId === "string" ? meta.imageId : null;
  const history = normalizeImageHistory(meta.imageHistory);

  // Newest-first: current, then history reversed (history is stored oldest-first).
  // The current row has no operation/timestamp — it's the live version.
  const ordered: Array<{
    imageId: string;
    isCurrent: boolean;
    operation?: ImageHistoryOperation;
    timestamp?: number;
  }> = [];
  if (currentImageId) {
    ordered.push({ imageId: currentImageId, isCurrent: true });
  }
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    ordered.push({
      imageId: e.imageId,
      isCurrent: false,
      operation: e.operation,
      timestamp: e.timestamp,
    });
  }

  const versions = ordered.map((v) => ({
    imageId: v.imageId,
    isCurrent: v.isCurrent,
    operation: v.operation ?? null,
    timestamp: v.timestamp ?? null,
    thumbnailSmUrl: getThumbnailUrl(v.imageId, "sm", cnMode),
    thumbnailMdUrl: getThumbnailUrl(v.imageId, "md", cnMode),
    imageUrl: getImageUrl(v.imageId, cnMode),
  }));

  return NextResponse.json({ versions });
}
