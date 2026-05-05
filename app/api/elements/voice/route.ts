import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getSignedAudioUrl } from "@/lib/storage/s3";

fal.config({
  credentials: process.env.FAL_API_KEY,
});

const CREATE_VOICE_ENDPOINT = "fal-ai/kling-video/create-voice";

/**
 * POST /api/elements/voice
 * Body: { audioId: string }
 *
 * Converts a previously-uploaded audio asset into a Kling voice ID by calling
 * FAL's kling-video/create-voice endpoint. The audio must be 5–30s of clean,
 * single-voice speech — validation of those constraints is FAL-side; we just
 * surface the error if the call fails.
 */
export async function POST(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = (await req.json()) as { audioId?: unknown };
    const audioId =
      typeof body.audioId === "string" && body.audioId.trim()
        ? body.audioId.trim()
        : null;
    if (!audioId) {
      return NextResponse.json(
        { error: "audioId is required" },
        { status: 400 }
      );
    }

    // FAL fetches the URL server-side; use a signed CloudFront URL with a
    // longer expiration so queued jobs stay valid.
    const voiceUrl = getSignedAudioUrl(audioId, 60 * 60 /* 1h */);

    const result = await fal.subscribe(CREATE_VOICE_ENDPOINT, {
      input: { voice_url: voiceUrl },
    });

    const voiceId = (result as { data?: { voice_id?: unknown } })?.data
      ?.voice_id;
    if (typeof voiceId !== "string" || !voiceId) {
      return NextResponse.json(
        { error: "FAL did not return a voice_id" },
        { status: 502 }
      );
    }

    return NextResponse.json({ voiceId });
  } catch (error) {
    console.error("Error creating voice:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create voice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
