import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { collectionImages, collections } from "@/lib/db/schema";
import { ensureDefaultProject } from "@/lib/db/projects";
import { checkVideoExists, checkImageExists, getSignedVideoUrl } from "@/lib/storage/s3";
import { and, desc, eq } from "drizzle-orm";

const COLLECTION_NAME = "My Video Uploads";

export async function POST(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { videoId, filename, skipCollection, thumbnailImageId } = body;

    if (!videoId || typeof videoId !== "string") {
      return NextResponse.json(
        { error: "videoId is required" },
        { status: 400 }
      );
    }

    const videoCheck = await checkVideoExists(videoId);
    if (!videoCheck.exists) {
      return NextResponse.json(
        { error: "Video not found in storage. Upload may have failed." },
        { status: 404 }
      );
    }

    // Validate thumbnail exists in S3 when provided; fall back to videoId otherwise
    let resolvedImageId = videoId;
    if (typeof thumbnailImageId === "string" && thumbnailImageId) {
      const thumbCheck = await checkImageExists(thumbnailImageId);
      if (thumbCheck.exists) {
        resolvedImageId = thumbnailImageId;
      }
    }

    if (skipCollection) {
      const videoUrl = getSignedVideoUrl(videoId);
      return NextResponse.json({ videoId, videoUrl });
    }

    const defaultProject = await ensureDefaultProject(payload.userId);

    let targetCollection = (
      await db
        .select()
        .from(collections)
        .where(
          and(
            eq(collections.userId, payload.userId),
            eq(collections.projectId, defaultProject.id),
            eq(collections.name, COLLECTION_NAME)
          )
        )
        .orderBy(desc(collections.updatedAt))
        .limit(1)
    )[0];

    if (!targetCollection) {
      const [created] = await db
        .insert(collections)
        .values({
          userId: payload.userId,
          projectId: defaultProject.id,
          name: COLLECTION_NAME,
        })
        .returning();
      targetCollection = created;
    }

    await db.insert(collectionImages).values({
      projectId: defaultProject.id,
      collectionId: targetCollection.id,
      imageId: resolvedImageId,
      assetId: videoId,
      assetType: "video",
      chatId: null,
      generationDetails: {
        title: filename || "Uploaded video",
        prompt: "",
        status: "generated",
      },
    });

    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, targetCollection.id));

    const videoUrl = getSignedVideoUrl(videoId);

    return NextResponse.json({ videoId, videoUrl });
  } catch (error) {
    console.error("[Video Confirm] Error:", error);
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
