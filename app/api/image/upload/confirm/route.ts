import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { collectionImages, collections } from "@/lib/db/schema";
import { ensureDefaultProject } from "@/lib/db/projects";
import { checkImageExists, getSignedImageUrl } from "@/lib/storage/s3";
import { and, desc, eq } from "drizzle-orm";

const UPLOADS_COLLECTION_NAME = "My Uploads";

/**
 * POST /api/image/upload/confirm
 * Confirm that a direct-to-S3 upload completed successfully
 * Creates the database records for the uploaded image
 *
 * Request body: { imageId: string, filename?: string }
 * Response: { imageId: string, imageUrl: string }
 */
export async function POST(request: NextRequest) {
  // Verify authentication
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
    const { imageId, filename } = body;

    // Validate required fields
    if (!imageId || typeof imageId !== "string") {
      return NextResponse.json(
        { error: "imageId is required" },
        { status: 400 }
      );
    }

    // Verify the image exists in S3
    const imageCheck = await checkImageExists(imageId);
    if (!imageCheck.exists) {
      return NextResponse.json(
        { error: "Image not found in storage. Upload may have failed." },
        { status: 404 }
      );
    }

    const defaultProject = await ensureDefaultProject(payload.userId);

    // Ensure the "My Uploads" collection exists in the default project
    let uploadsCollection = (
      await db
        .select()
        .from(collections)
        .where(
          and(
            eq(collections.userId, payload.userId),
            eq(collections.projectId, defaultProject.id),
            eq(collections.name, UPLOADS_COLLECTION_NAME)
          )
        )
        .orderBy(desc(collections.updatedAt))
        .limit(1)
    )[0];

    if (!uploadsCollection) {
      const [created] = await db
        .insert(collections)
        .values({
          userId: payload.userId,
          projectId: defaultProject.id,
          name: UPLOADS_COLLECTION_NAME,
        })
        .returning();
      uploadsCollection = created;
    }

    // Save uploaded image in "My Uploads"
    await db.insert(collectionImages).values({
      projectId: defaultProject.id,
      collectionId: uploadsCollection.id,
      imageId,
      chatId: null,
      generationDetails: {
        title: filename || "Uploaded image",
        prompt: "",
        status: "generated",
      },
    });

    // Update collection timestamp
    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, uploadsCollection.id));

    // Generate signed URL for immediate display
    const imageUrl = getSignedImageUrl(imageId);

    return NextResponse.json({
      imageId,
      imageUrl,
    });
  } catch (error) {
    console.error("[Image Confirm] Error:", error);
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
