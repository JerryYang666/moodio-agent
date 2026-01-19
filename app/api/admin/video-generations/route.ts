import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const allGenerations = await db
      .select({
        id: videoGenerations.id,
        modelId: videoGenerations.modelId,
        status: videoGenerations.status,
        sourceImageId: videoGenerations.sourceImageId,
        endImageId: videoGenerations.endImageId,
        videoId: videoGenerations.videoId,
        thumbnailImageId: videoGenerations.thumbnailImageId,
        params: videoGenerations.params,
        error: videoGenerations.error,
        seed: videoGenerations.seed,
        createdAt: videoGenerations.createdAt,
        completedAt: videoGenerations.completedAt,
        userId: videoGenerations.userId,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(videoGenerations)
      .leftJoin(users, eq(videoGenerations.userId, users.id))
      .orderBy(desc(videoGenerations.createdAt));

    const generationsWithUrls = allGenerations.map((g) => ({
      ...g,
      sourceImageUrl: getImageUrl(g.sourceImageId),
      endImageUrl: g.endImageId ? getImageUrl(g.endImageId) : null,
      videoUrl: g.videoId ? getVideoUrl(g.videoId) : null,
      thumbnailUrl: g.thumbnailImageId
        ? getImageUrl(g.thumbnailImageId)
        : null,
    }));

    return NextResponse.json({ generations: generationsWithUrls });
  } catch (error) {
    console.error("Error fetching video generations:", error);
    return NextResponse.json(
      { error: "Failed to fetch video generations" },
      { status: 500 }
    );
  }
}
