/**
 * Snap an arbitrary width/height to the closest supported aspect ratio.
 *
 * Used by the in-canvas image-edit flow so that when a user edits (redraw /
 * erase / cutout) an image, we ask the model to produce an output roughly the
 * same shape as the source — instead of letting the provider default to "auto"
 * and possibly changing the canvas tile's proportions on every edit.
 */

export const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

/**
 * Pick the supported aspect ratio whose W/H is closest to the given dimensions.
 * Compares in log-space so 3:2 and 2:3 are equidistant from 1:1 (rather than
 * biased toward landscape ratios by absolute diff).
 *
 * Returns null if dimensions are invalid (zero or non-finite).
 */
export function snapToSupportedAspectRatio(
  width: number,
  height: number
): SupportedAspectRatio | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  const target = Math.log(width / height);
  let best: SupportedAspectRatio = SUPPORTED_ASPECT_RATIOS[0];
  let bestDelta = Infinity;
  for (const ratio of SUPPORTED_ASPECT_RATIOS) {
    const [rw, rh] = ratio.split(":").map(Number);
    if (!rw || !rh) continue;
    const delta = Math.abs(Math.log(rw / rh) - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = ratio;
    }
  }
  return best;
}
