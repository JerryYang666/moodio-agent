import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  getImageUrl,
  getVideoUrl,
  getAudioUrl,
  getMediaContentType,
  getSignedDownloadUrl,
} from "@/lib/storage/s3";
import { getUserSetting } from "@/lib/user-settings/server";
import {
  normalizeDownloadBasename,
  buildDownloadFilename,
  extensionFromContentType,
} from "@/lib/download-filename";

interface MediaRef {
  type: "image" | "video" | "audio";
  id: string;
  /** Optional basename hint used when generating download filenames. */
  filename?: string;
}

const MAX_REFS = 50;

/** Expiration for signed download URLs (5 minutes). */
const DOWNLOAD_URL_EXPIRATION_SECONDS = 5 * 60;

/**
 * POST /api/media/enrich
 * Resolves media reference IDs to CDN URLs.
 *
 * Body: { refs: Array<{ type, id, filename? }>, download?: boolean }
 *
 * When `download` is true the response also includes `downloadUrls` —
 * a map of id → { url, filename } where `url` is a CloudFront signed URL
 * and `filename` includes the correct file extension.
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
    const body = (await request.json()) as {
      refs: MediaRef[];
      download?: boolean;
    };
    const { refs, download } = body;

    if (!Array.isArray(refs) || refs.length === 0) {
      return NextResponse.json({ urls: {} });
    }

    const trimmed = refs.slice(0, MAX_REFS);
    const cnMode = await getUserSetting(payload.userId, "cnMode");

    // Always build display URLs (existing behaviour)
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

    if (!download) {
      return NextResponse.json({ urls });
    }

    // Build signed download URLs + filenames in parallel
    const validRefs = trimmed.filter(
      (r) => r.id && typeof r.id === "string"
    );

    const contentTypes = await Promise.all(
      validRefs.map((ref) => getMediaContentType(ref.type, ref.id))
    );

    const downloadUrls: Record<string, { url: string; filename: string }> = {};

    for (let i = 0; i < validRefs.length; i++) {
      const ref = validRefs[i];
      const ct = contentTypes[i];
      const ext = extensionFromContentType(ct, ref.type);
      const basename = normalizeDownloadBasename(ref.filename, ref.type);
      const filename = buildDownloadFilename(basename, ext);
      const url = getSignedDownloadUrl(
        ref.type,
        ref.id,
        cnMode,
        DOWNLOAD_URL_EXPIRATION_SECONDS
      );
      downloadUrls[ref.id] = { url, filename };
    }

    return NextResponse.json({ urls, downloadUrls });
  } catch (error) {
    console.error("[Media Enrich] Error:", error);
    return NextResponse.json(
      { error: "Failed to enrich media references" },
      { status: 500 }
    );
  }
}
