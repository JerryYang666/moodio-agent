import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getImageUrl, getVideoUrl, getAudioUrl } from "@/lib/storage/s3";
import { getUserSetting } from "@/lib/user-settings/server";

interface MediaRef {
  type: "image" | "video" | "audio";
  id: string;
}

const MAX_REFS = 50;

/**
 * POST /api/media/enrich
 * Resolves media reference IDs to CDN URLs.
 *
 * Body: { refs: Array<{ type: "image"|"video"|"audio", id: string }> }
 * Returns: { urls: Record<string, string> }
 */
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
    const { refs } = (await request.json()) as { refs: MediaRef[] };

    if (!Array.isArray(refs) || refs.length === 0) {
      return NextResponse.json({ urls: {} });
    }

    const trimmed = refs.slice(0, MAX_REFS);
    const cnMode = await getUserSetting(payload.userId, "cnMode");
    const urls: Record<string, string> = {};

    for (const ref of trimmed) {
      if (!ref.id || typeof ref.id !== "string") continue;
      switch (ref.type) {
        case "image":
          urls[ref.id] = getImageUrl(ref.id, cnMode);
          break;
        case "video":
          urls[ref.id] = getVideoUrl(ref.id, cnMode);
          break;
        case "audio":
          urls[ref.id] = getAudioUrl(ref.id, cnMode);
          break;
      }
    }

    return NextResponse.json({ urls });
  } catch (error) {
    console.error("[Media Enrich] Error:", error);
    return NextResponse.json(
      { error: "Failed to enrich media references" },
      { status: 500 }
    );
  }
}
