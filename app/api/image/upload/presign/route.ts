import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { generateImageId, getPresignedUploadUrl } from "@/lib/storage/s3";
import { siteConfig } from "@/config/site";

/**
 * POST /api/image/upload/presign
 * Generate a presigned URL for direct-to-S3 upload
 * This bypasses Vercel's 4.5MB request body limit
 *
 * Request body: { contentType: string, contentLength: number, filename?: string }
 * Response: { imageId: string, uploadUrl: string, expiresIn: number }
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
    const { contentType, contentLength, filename } = body;

    // Validate required fields
    if (!contentType || typeof contentLength !== "number") {
      return NextResponse.json(
        { error: "contentType and contentLength are required" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!siteConfig.upload.allowedImageTypes.includes(contentType)) {
      return NextResponse.json(
        { error: "Invalid file type. Supported: JPEG, PNG, GIF, WebP" },
        { status: 400 }
      );
    }

    // Validate file size
    const maxFileSize = siteConfig.upload.maxFileSizeMB * 1024 * 1024;
    if (contentLength > maxFileSize) {
      return NextResponse.json(
        { error: `File size limit is ${siteConfig.upload.maxFileSizeMB}MB` },
        { status: 400 }
      );
    }

    if (contentLength <= 0) {
      return NextResponse.json(
        { error: "Invalid file size" },
        { status: 400 }
      );
    }

    // Generate a unique image ID
    const imageId = generateImageId();

    // Generate presigned URL
    const expiresIn = siteConfig.upload.presignedUrlExpiresIn;
    const uploadUrl = await getPresignedUploadUrl(
      imageId,
      contentType,
      contentLength,
      expiresIn
    );

    return NextResponse.json({
      imageId,
      uploadUrl,
      expiresIn,
    });
  } catch (error) {
    console.error("[Image Presign] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
