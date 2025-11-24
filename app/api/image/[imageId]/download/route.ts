import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { downloadImage } from "@/lib/storage/s3";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;

    // Optional: Verify authentication
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
    const filename = searchParams.get("filename") || "image";

    // Download image from S3
    const imageBuffer = await downloadImage(imageId);

    if (!imageBuffer) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Determine content type from the image buffer (magic bytes)
    let contentType = "image/png"; // Default
    let extension = ".png";

    // Check magic bytes for common image formats
    if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
      contentType = "image/jpeg";
      extension = ".jpg";
    } else if (
      imageBuffer[0] === 0x89 &&
      imageBuffer[1] === 0x50 &&
      imageBuffer[2] === 0x4e &&
      imageBuffer[3] === 0x47
    ) {
      contentType = "image/png";
      extension = ".png";
    } else if (
      imageBuffer[0] === 0x47 &&
      imageBuffer[1] === 0x49 &&
      imageBuffer[2] === 0x46
    ) {
      contentType = "image/gif";
      extension = ".gif";
    } else if (
      imageBuffer[0] === 0x52 &&
      imageBuffer[1] === 0x49 &&
      imageBuffer[2] === 0x46 &&
      imageBuffer[3] === 0x46
    ) {
      contentType = "image/webp";
      extension = ".webp";
    }

    // Sanitize filename
    const safeFilename =
      filename
        .replace(/[^a-z0-9\s-]/gi, "")
        .replace(/\s+/g, "_")
        .substring(0, 100) || "image";

    const finalFilename = `${safeFilename}${extension}`;

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(imageBuffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${finalFilename}"`,
        "Content-Length": imageBuffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error downloading image:", error);
    return NextResponse.json(
      { error: "Failed to download image" },
      { status: 500 }
    );
  }
}
