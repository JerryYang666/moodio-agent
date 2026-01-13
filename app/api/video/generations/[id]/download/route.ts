import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { downloadVideo } from "@/lib/storage/s3";

/**
 * GET /api/video/generations/[id]/download
 * Downloads a video file for a generation
 * Proxies the download through our server to avoid CORS issues with S3
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify authentication
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Find generation that belongs to the user
    const [generation] = await db
      .select()
      .from(videoGenerations)
      .where(
        and(
          eq(videoGenerations.id, id),
          eq(videoGenerations.userId, payload.userId)
        )
      )
      .limit(1);

    if (!generation) {
      return NextResponse.json(
        { error: "Generation not found" },
        { status: 404 }
      );
    }

    if (!generation.videoId) {
      return NextResponse.json(
        { error: "Video not available for this generation" },
        { status: 404 }
      );
    }

    // Get filename from query params
    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get("filename") || "video";

    // Download video from S3
    const videoBuffer = await downloadVideo(generation.videoId);

    if (!videoBuffer) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Determine content type from the video buffer (magic bytes)
    let contentType = "video/mp4"; // Default
    let extension = ".mp4";

    // Check magic bytes for common video formats
    // MP4 typically starts with ftyp atom
    if (
      videoBuffer[4] === 0x66 && // 'f'
      videoBuffer[5] === 0x74 && // 't'
      videoBuffer[6] === 0x79 && // 'y'
      videoBuffer[7] === 0x70    // 'p'
    ) {
      contentType = "video/mp4";
      extension = ".mp4";
    }
    // WebM starts with 0x1A 0x45 0xDF 0xA3
    else if (
      videoBuffer[0] === 0x1a &&
      videoBuffer[1] === 0x45 &&
      videoBuffer[2] === 0xdf &&
      videoBuffer[3] === 0xa3
    ) {
      contentType = "video/webm";
      extension = ".webm";
    }

    // Sanitize filename
    const safeFilename =
      filename
        .replace(/[^a-z0-9\s-]/gi, "")
        .replace(/\s+/g, "_")
        .substring(0, 100) || "video";

    const finalFilename = `${safeFilename}${extension}`;

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(videoBuffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${finalFilename}"`,
        "Content-Length": videoBuffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error downloading video:", error);
    return NextResponse.json(
      { error: "Failed to download video" },
      { status: 500 }
    );
  }
}
