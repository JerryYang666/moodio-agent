import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";
import { checkAndRecoverStaleGenerations } from "@/lib/video/recovery";
import { waitUntil } from "@vercel/functions";

/**
 * GET /api/video/generations
 * List current user's video generations
 *
 * Also triggers background recovery of stale generations (60+ minutes old)
 * where webhooks may have failed.
 *
 * Query params:
 * - limit: number (default 20, max 100)
 * - offset: number (default 0)
 * - status: string (optional filter by status)
 */
export async function GET(request: NextRequest) {
  // Verify authentication
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(
    parseInt(searchParams.get("limit") || "20", 10),
    100
  );
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const statusFilter = searchParams.get("status");

  // Trigger background recovery of stale generations (non-blocking)
  waitUntil(
    checkAndRecoverStaleGenerations(payload.userId).catch((err) => {
      console.error("[Video Generations] Background recovery error:", err);
    })
  );

  try {
    // Build query
    let query = db
      .select()
      .from(videoGenerations)
      .where(eq(videoGenerations.userId, payload.userId))
      .orderBy(desc(videoGenerations.createdAt))
      .limit(limit)
      .offset(offset);

    const generations = await query;

    // Filter by status if provided (done in JS since drizzle query building is complex)
    let filteredGenerations = generations;
    if (statusFilter) {
      filteredGenerations = generations.filter((g) => g.status === statusFilter);
    }

    // Add CloudFront URLs
    const generationsWithUrls = filteredGenerations.map((g) => ({
      id: g.id,
      modelId: g.modelId,
      status: g.status,
      sourceImageId: g.sourceImageId,
      sourceImageUrl: getImageUrl(g.sourceImageId),
      endImageId: g.endImageId,
      endImageUrl: g.endImageId ? getImageUrl(g.endImageId) : null,
      videoId: g.videoId,
      videoUrl: g.videoId ? getVideoUrl(g.videoId) : null,
      thumbnailImageId: g.thumbnailImageId,
      thumbnailUrl: g.thumbnailImageId
        ? getImageUrl(g.thumbnailImageId)
        : null,
      params: g.params,
      error: g.error,
      seed: g.seed,
      createdAt: g.createdAt,
      completedAt: g.completedAt,
    }));

    return NextResponse.json({
      generations: generationsWithUrls,
      total: generationsWithUrls.length,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[Video Generations] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch generations" },
      { status: 500 }
    );
  }
}
