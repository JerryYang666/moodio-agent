import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations, teamMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getImageUrl, getVideoUrl, getSignedVideoUrl } from "@/lib/storage/s3";
import { resolveUpscaledVideos } from "@/lib/video/upscale-utils";

/**
 * GET /api/video/generations/[id]
 * Get a single video generation by ID
 * Only returns the generation if it belongs to the current user,
 * or if the requester is a team owner/admin and the generator is a team member (hint-based).
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
    const [generation] = await db
      .select()
      .from(videoGenerations)
      .where(eq(videoGenerations.id, id))
      .limit(1);

    if (!generation) {
      return NextResponse.json(
        { error: "Generation not found" },
        { status: 404 }
      );
    }

    const isOwner = generation.userId === payload.userId;

    if (!isOwner) {
      const { searchParams } = new URL(request.url);
      const teamIdHint = searchParams.get("teamId");

      let granted = false;
      if (teamIdHint) {
        const membership = payload.teams?.find((t) => t.id === teamIdHint);
        if (membership && (membership.role === "owner" || membership.role === "admin")) {
          const [genOwnerMembership] = await db
            .select()
            .from(teamMembers)
            .where(
              and(
                eq(teamMembers.teamId, teamIdHint),
                eq(teamMembers.userId, generation.userId)
              )
            )
            .limit(1);
          if (genOwnerMembership) {
            granted = true;
          }
        }
      }

      if (!granted) {
        return NextResponse.json(
          { error: "Generation not found" },
          { status: 404 }
        );
      }
    }

    // Add CloudFront URLs
    const generationWithUrls = {
      id: generation.id,
      modelId: generation.modelId,
      provider: generation.provider,
      providerRequestId: generation.providerRequestId,
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
      signedVideoUrl: generation.videoId
        ? getSignedVideoUrl(generation.videoId)
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
      upscaled: resolveUpscaledVideos(generation.params as Record<string, any>),
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
