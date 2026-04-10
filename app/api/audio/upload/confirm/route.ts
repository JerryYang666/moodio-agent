import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { collectionImages, collections } from "@/lib/db/schema";
import { ensureDefaultProject } from "@/lib/db/projects";
import { checkAudioExists, getSignedAudioUrl } from "@/lib/storage/s3";
import { and, desc, eq } from "drizzle-orm";

const COLLECTION_NAME = "My Audio Uploads";

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
    const { audioId, filename, skipCollection } = body;

    if (!audioId || typeof audioId !== "string") {
      return NextResponse.json(
        { error: "audioId is required" },
        { status: 400 }
      );
    }

    const audioCheck = await checkAudioExists(audioId);
    if (!audioCheck.exists) {
      return NextResponse.json(
        { error: "Audio not found in storage. Upload may have failed." },
        { status: 404 }
      );
    }

    if (skipCollection) {
      const audioUrl = getSignedAudioUrl(audioId);
      return NextResponse.json({ audioId, audioUrl });
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
      imageId: "audio-file-placeholder",
      assetId: audioId,
      assetType: "audio",
      chatId: null,
      generationDetails: {
        title: filename || "Uploaded audio",
        prompt: "",
        status: "generated",
      },
    });

    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, targetCollection.id));

    const audioUrl = getSignedAudioUrl(audioId);

    return NextResponse.json({ audioId, audioUrl });
  } catch (error) {
    console.error("[Audio Confirm] Error:", error);
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
