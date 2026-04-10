import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { downloadAudio } from "@/lib/storage/s3";
import {
  buildAttachmentContentDisposition,
  buildDownloadFilename,
  normalizeDownloadBasename,
} from "@/lib/download-filename";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ audioId: string }> }
) {
  try {
    const { audioId } = await params;

    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get("filename") || "audio";

    const audioBuffer = await downloadAudio(audioId);

    if (!audioBuffer) {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }

    let contentType = "audio/mpeg";
    let extension = ".mp3";

    // WAV starts with "RIFF"
    if (
      audioBuffer[0] === 0x52 &&
      audioBuffer[1] === 0x49 &&
      audioBuffer[2] === 0x46 &&
      audioBuffer[3] === 0x46
    ) {
      contentType = "audio/wav";
      extension = ".wav";
    }

    const basename = normalizeDownloadBasename(filename, "audio");
    const finalFilename = buildDownloadFilename(basename, extension);

    const uint8Array = new Uint8Array(audioBuffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": buildAttachmentContentDisposition(finalFilename),
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error downloading audio:", error);
    return NextResponse.json(
      { error: "Failed to download audio" },
      { status: 500 }
    );
  }
}
