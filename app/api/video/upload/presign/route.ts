import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { generateVideoId, getPresignedVideoUploadUrl } from "@/lib/storage/s3";
import { siteConfig } from "@/config/site";

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
    const { contentType, contentLength } = body;

    if (!contentType || typeof contentLength !== "number") {
      return NextResponse.json(
        { error: "contentType and contentLength are required" },
        { status: 400 }
      );
    }

    if (!siteConfig.upload.allowedVideoTypes.includes(contentType)) {
      return NextResponse.json(
        { error: "Invalid file type. Supported: MP4, WebM, MOV (QuickTime), AVI" },
        { status: 400 }
      );
    }

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

    const videoId = generateVideoId();
    const expiresIn = siteConfig.upload.presignedUrlExpiresIn;
    const uploadUrl = await getPresignedVideoUploadUrl(
      videoId,
      contentType,
      contentLength,
      expiresIn
    );

    return NextResponse.json({ videoId, uploadUrl, expiresIn });
  } catch (error) {
    console.error("[Video Presign] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
