import { extractVideoIdFromUrl, getVideoProxyUrl } from "./videoProxy";

/**
 * Probe whether a source video has a decodable audio track.
 *
 * Returns `false` only when `decodeAudioData` succeeds with an empty
 * buffer or explicitly fails; any other error (no AudioContext, fetch
 * failure, missing videoId, etc.) returns `true`. This bias minimizes
 * false negatives, which would cause offline-audio bugs on NLE import.
 */
export async function probeHasAudio(
  videoUrl: string | null | undefined
): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const AudioCtxCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtxCtor) return true;

  const videoId = extractVideoIdFromUrl(videoUrl);
  if (!videoId) return true;

  let response: Response;
  try {
    response = await fetch(getVideoProxyUrl(videoId));
  } catch {
    return true;
  }
  if (!response.ok) return true;

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await response.arrayBuffer();
  } catch {
    return true;
  }

  const ctx = new AudioCtxCtor();
  try {
    // slice(0) because decodeAudioData may consume its input buffer.
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (!buffer) return false;
    return buffer.numberOfChannels > 0 && buffer.length > 0;
  } catch {
    return false;
  } finally {
    void ctx.close().catch(() => {});
  }
}
