import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { downloadImage } from "@/lib/storage/s3";
import {
  buildAttachmentContentDisposition,
  buildDownloadFilename,
  normalizeDownloadBasename,
} from "@/lib/download-filename";
import sharp from "sharp";

type ImageFormat = "webp" | "png" | "jpeg";

const FORMAT_CONFIG: Record<
  ImageFormat,
  { contentType: string; extension: string }
> = {
  webp: { contentType: "image/webp", extension: ".webp" },
  png: { contentType: "image/png", extension: ".png" },
  jpeg: { contentType: "image/jpeg", extension: ".jpg" },
};

function detectFormat(buffer: Buffer): {
  contentType: string;
  extension: string;
} {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { contentType: "image/jpeg", extension: ".jpg" };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { contentType: "image/png", extension: ".png" };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { contentType: "image/gif", extension: ".gif" };
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    return { contentType: "image/webp", extension: ".webp" };
  }
  return { contentType: "image/png", extension: ".png" };
}

async function convertImage(
  imageBuffer: Buffer,
  targetFormat: ImageFormat
): Promise<Buffer> {
  const pipeline = sharp(imageBuffer).rotate();
  switch (targetFormat) {
    case "png":
      return await pipeline.png().keepIccProfile().toBuffer();
    case "jpeg":
      return await pipeline.jpeg({ quality: 95 }).keepIccProfile().toBuffer();
    case "webp":
      return await pipeline
        .webp({ quality: 95, smartSubsample: true })
        .keepIccProfile()
        .toBuffer();
  }
}

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

    // Get filename and format from query params
    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get("filename") || "image";
    const requestedFormat = searchParams.get("format") as ImageFormat | null;

    // Download image from S3
    const imageBuffer = await downloadImage(imageId);

    if (!imageBuffer) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Determine the source format from magic bytes
    const sourceInfo = detectFormat(imageBuffer);

    let outputBuffer: Buffer;
    let contentType: string;
    let extension: string;

    if (
      requestedFormat &&
      FORMAT_CONFIG[requestedFormat] &&
      sourceInfo.contentType !== FORMAT_CONFIG[requestedFormat].contentType
    ) {
      // Convert to the requested format
      outputBuffer = await convertImage(imageBuffer, requestedFormat);
      contentType = FORMAT_CONFIG[requestedFormat].contentType;
      extension = FORMAT_CONFIG[requestedFormat].extension;
    } else if (requestedFormat && FORMAT_CONFIG[requestedFormat]) {
      // Requested format matches source — no conversion needed
      outputBuffer = imageBuffer;
      contentType = FORMAT_CONFIG[requestedFormat].contentType;
      extension = FORMAT_CONFIG[requestedFormat].extension;
    } else {
      // No format requested — serve as-is
      outputBuffer = imageBuffer;
      contentType = sourceInfo.contentType;
      extension = sourceInfo.extension;
    }

    const basename = normalizeDownloadBasename(filename, "image");
    const finalFilename = buildDownloadFilename(basename, extension);

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(outputBuffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": buildAttachmentContentDisposition(finalFilename),
        "Content-Length": outputBuffer.length.toString(),
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
