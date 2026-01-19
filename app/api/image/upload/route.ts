import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { collectionImages, collections } from "@/lib/db/schema";
import { ensureDefaultProject } from "@/lib/db/projects";
import { uploadImage, getImageUrl } from "@/lib/storage/s3";
import { and, desc, eq } from "drizzle-orm";

const UPLOADS_COLLECTION_NAME = "My Uploads";

/**
 * POST /api/image/upload
 * Immediately upload an image and return the imageId and CloudFront URL
 * This endpoint is used for immediate upload when user selects a file
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
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image size limit is 5MB" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Supported: JPEG, PNG, GIF, WebP" },
        { status: 400 }
      );
    }

    const defaultProject = await ensureDefaultProject(payload.userId);

    // Ensure the "My Uploads" collection exists in the default project.
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

    // Upload to S3
    const imageId = await uploadImage(file, file.type);

    // Save uploaded image in "My Uploads"
    await db.insert(collectionImages).values({
      projectId: defaultProject.id,
      collectionId: uploadsCollection.id,
      imageId,
      chatId: null,
      generationDetails: {
        title: file.name || "Uploaded image",
        prompt: "",
        status: "generated",
      },
    });

    // Update collection timestamp
    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, uploadsCollection.id));

    // Generate CloudFront URL for immediate display
    const imageUrl = getImageUrl(imageId);

    return NextResponse.json({
      imageId,
      imageUrl,
    });
  } catch (error) {
    console.error("[Image Upload] Error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
