import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { collectionImages, collections } from "@/lib/db/schema";
import { ensureDefaultProject } from "@/lib/db/projects";
import { uploadImage, getSignedImageUrl } from "@/lib/storage/s3";
import { siteConfig } from "@/config/site";
import { and, desc, eq } from "drizzle-orm";

const UPLOADS_COLLECTION_NAME = "My Uploads";

/**
 * POST /api/image/upload
 * Legacy direct upload endpoint - limited by Vercel's 4.5MB request body limit
 *
 * For larger uploads, use the presigned URL flow:
 * 1. POST /api/image/upload/presign
 * 2. PUT to S3 presigned URL
 * 3. POST /api/image/upload/confirm
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

    // Validate file size
    // Note: This endpoint is limited by Vercel's 4.5MB request body limit
    // For larger uploads, use the presigned URL flow (/api/image/upload/presign)
    const maxFileSize = siteConfig.upload.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxFileSize) {
      return NextResponse.json(
        { error: `Image size limit is ${siteConfig.upload.maxFileSizeMB}MB` },
        { status: 400 }
      );
    }

    // Validate file type
    if (!siteConfig.upload.allowedImageTypes.includes(file.type)) {
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
      assetId: imageId, // For images, assetId = imageId
      assetType: "image",
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

    // Generate signed URL for immediate display (upload may finish after cookie expiry)
    const imageUrl = getSignedImageUrl(imageId);

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
