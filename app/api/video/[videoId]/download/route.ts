import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { downloadVideo } from "@/lib/storage/s3";
import {
  buildAttachmentContentDisposition,
  buildDownloadFilename,
  normalizeDownloadBasename,
} from "@/lib/download-filename";

/**
 * GET /api/video/[videoId]/download
 * Downloads a video file by its raw videoId (S3 key: videos/{videoId}).
 * Proxies the download through our server to avoid CORS / CloudFront
 * signed-cookie issues when the client tries to fetch() the video URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;

    // Verify authentication
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get filename from query params
    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get("filename") || "video";

    // Download video from S3
    const videoBuffer = await downloadVideo(videoId);

    if (!videoBuffer) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Determine content type from the video buffer (magic bytes)
    let contentType = "video/mp4"; // Default
    let extension = ".mp4";

    // MP4 typically starts with ftyp atom
    if (
      videoBuffer[4] === 0x66 && // 'f'
      videoBuffer[5] === 0x74 && // 't'
      videoBuffer[6] === 0x79 && // 'y'
      videoBuffer[7] === 0x70 // 'p'
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

    const basename = normalizeDownloadBasename(filename, "video");
    const finalFilename = buildDownloadFilename(basename, extension);

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(videoBuffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": buildAttachmentContentDisposition(finalFilename),
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
