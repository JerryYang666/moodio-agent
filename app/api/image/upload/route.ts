import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { uploadImage, getSignedImageUrl } from "@/lib/storage/s3";

/**
 * POST /api/image/upload
 * Immediately upload an image and return the imageId and signed URL
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

    // Upload to S3
    const imageId = await uploadImage(file, file.type);

    // Generate signed URL for immediate display
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
