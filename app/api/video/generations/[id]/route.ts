import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";

/**
 * GET /api/video/generations/[id]
 * Get a single video generation by ID
 * Only returns the generation if it belongs to the current user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Verify authentication
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Find generation that belongs to the user
    const [generation] = await db
      .select()
      .from(videoGenerations)
      .where(
        and(
          eq(videoGenerations.id, id),
          eq(videoGenerations.userId, payload.userId)
        )
      )
      .limit(1);

    if (!generation) {
      return NextResponse.json(
        { error: "Generation not found" },
        { status: 404 }
      );
    }

    // Add CloudFront URLs
    const generationWithUrls = {
      id: generation.id,
      modelId: generation.modelId,
      status: generation.status,
      sourceImageId: generation.sourceImageId,
      sourceImageUrl: getImageUrl(generation.sourceImageId),
      endImageId: generation.endImageId,
      endImageUrl: generation.endImageId
        ? getImageUrl(generation.endImageId)
        : null,
      videoId: generation.videoId,
      videoUrl: generation.videoId
        ? getVideoUrl(generation.videoId)
        : null,
      thumbnailImageId: generation.thumbnailImageId,
      thumbnailUrl: generation.thumbnailImageId
        ? getImageUrl(generation.thumbnailImageId)
        : null,
      params: generation.params,
      error: generation.error,
      seed: generation.seed,
      createdAt: generation.createdAt,
      completedAt: generation.completedAt,
    };

    return NextResponse.json({ generation: generationWithUrls });
  } catch (error: any) {
    console.error("[Video Generation] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch generation" },
      { status: 500 }
    );
  }
}
