import type { TimelineClip } from "@/components/timeline/types";
import { getEffectiveDuration } from "@/components/timeline/types";

// Layout constants — must match TimelineTrack + TimelineClipCard rendering.
export const LABEL_WIDTH = 80;
export const TRACK_PAD_X = 8;
export const INDICATOR_WIDTH = 4;
export const PX_PER_SECOND = 30;
export const DEFAULT_LOADING_WIDTH = 120;

export interface ClipRange {
  clipIndex: number;
  /** Absolute x within the tracks-inner element. */
  leftPx: number;
  widthPx: number;
  /** Cumulative timeline seconds at leftPx. */
  startTime: number;
  endTime: number;
}

export interface SeekTarget {
  clipIndex: number;
  /** Source-video seconds within that clip (i.e. HTMLVideoElement.currentTime). */
  sourceTime: number;
}

/**
 * Pixel range + timeline-time window for each clip's card within
 * tracks-inner. Layout:
 *
 *   [ LABEL_WIDTH ][ TRACK_PAD_X ][ INDICATOR_WIDTH ][ clip0 ][ INDICATOR_WIDTH ][ clip1 ]...
 *
 * Card width matches `TimelineClipCard`: `effDur * PX_PER_SECOND`, or
 * `DEFAULT_LOADING_WIDTH` while duration is being probed.
 */
export function computeClipRanges(clips: TimelineClip[]): ClipRange[] {
  const out: ClipRange[] = [];
  let px = LABEL_WIDTH + TRACK_PAD_X + INDICATOR_WIDTH;
  let t = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const effDur = getEffectiveDuration(clip);
    const durationKnown = clip.duration > 0;
    const width = !durationKnown
      ? DEFAULT_LOADING_WIDTH
      : effDur * PX_PER_SECOND;
    out.push({
      clipIndex: i,
      leftPx: px,
      widthPx: width,
      startTime: t,
      endTime: t + effDur,
    });
    px += width + INDICATOR_WIDTH;
    t += effDur;
  }
  return out;
}

/**
 * Maps an x-coordinate in tracks-inner to `(clipIndex, sourceTime)`.
 * Returns null for gaps (drop indicators / padding) or past the last clip.
 */
export function pxToClipTime(
  px: number,
  clips: TimelineClip[],
  ranges: ClipRange[]
): SeekTarget | null {
  for (const r of ranges) {
    if (px >= r.leftPx && px <= r.leftPx + r.widthPx) {
      const clip = clips[r.clipIndex];
      if (!clip) return null;
      const progress = r.widthPx > 0 ? (px - r.leftPx) / r.widthPx : 0;
      const trimStart = clip.trimStart ?? 0;
      const trimEnd = clip.trimEnd ?? clip.duration;
      const sourceTime = trimStart + progress * (trimEnd - trimStart);
      return { clipIndex: r.clipIndex, sourceTime };
    }
  }
  return null;
}

/**
 * Maps a timeline-global time to pixels within tracks-inner via
 * piecewise linear interpolation per clip range. Clamps to the first
 * clip's left edge / last clip's right edge on out-of-range input.
 */
export function timelineTimeToPx(
  timelineTime: number,
  ranges: ClipRange[]
): number | null {
  if (ranges.length === 0) return null;
  if (timelineTime <= ranges[0].startTime) return ranges[0].leftPx;

  for (const r of ranges) {
    if (timelineTime >= r.startTime && timelineTime <= r.endTime) {
      const span = r.endTime - r.startTime;
      const progress = span > 0 ? (timelineTime - r.startTime) / span : 0;
      return r.leftPx + progress * r.widthPx;
    }
  }
  const last = ranges[ranges.length - 1];
  return last.leftPx + last.widthPx;
}

/** Active clip + source time → timeline-global time in seconds. */
export function computeTimelineTime(
  clips: TimelineClip[],
  activeClipIndex: number,
  sourceTime: number
): number {
  const clip = clips[activeClipIndex];
  if (!clip) return 0;
  let before = 0;
  for (let i = 0; i < activeClipIndex; i++) {
    before += getEffectiveDuration(clips[i]);
  }
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? clip.duration;
  const withinClip = Math.max(0, Math.min(trimEnd - trimStart, sourceTime - trimStart));
  return before + withinClip;
}
