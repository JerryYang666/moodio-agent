/**
 * Helpers for routing browser-side fetches of timeline source media
 * through the Next.js video proxy. Direct CloudFront `fetch()` 403s on
 * the same URLs the `<video>` element plays fine, so anything needing
 * raw bytes (zip bundling, audio probe) goes through the proxy.
 */

/**
 * Extracts the storage UUID from a `.../videos/{uuid}/...` URL.
 * `TimelineClip.assetId` is the desktop asset row id, not this UUID,
 * so callers must pass `clip.videoUrl`.
 */
export function extractVideoIdFromUrl(
  videoUrl: string | null | undefined
): string | null {
  if (!videoUrl) return null;
  try {
    const pathname = new URL(videoUrl, "http://placeholder").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("videos");
    if (idx >= 0 && idx + 1 < parts.length) {
      return parts[idx + 1];
    }
  } catch {
    // fall through
  }
  return null;
}

export function getVideoProxyUrl(videoId: string): string {
  return `/api/video/${encodeURIComponent(videoId)}/download?filename=${encodeURIComponent(`${videoId}.mp4`)}`;
}
