/**
 * Timeline editor types.
 *
 * The timeline is a lightweight sequencing layer — no real media processing.
 * Video/audio separation is a UI-only abstraction.
 */

export interface TimelineClip {
  /** Unique clip ID (generated client-side) */
  id: string;
  /** The desktop asset ID this clip references */
  assetId: string;
  /** Display title */
  title: string;
  /** Thumbnail URL (the asset's poster image) */
  thumbnailUrl: string | null;
  /** Playback URL for the video */
  videoUrl: string | null;
  /** Duration in seconds (from asset metadata, or 0 if unknown) */
  duration: number;
  /** Trim start in seconds (default: 0 = beginning of clip) */
  trimStart?: number;
  /** Trim end in seconds (default: duration = end of clip) */
  trimEnd?: number;
  /**
   * Whether the source video has an audio track. Probed asynchronously
   * in `useTimeline.addClip`; `undefined` is treated as `true` so
   * XML exports / UI only drop audio when `hasAudio === false`.
   */
  hasAudio?: boolean;
}

export interface TimelineState {
  /** Ordered list of clips on the timeline */
  clips: TimelineClip[];
  /** ID of the desktop this timeline belongs to */
  desktopId: string;
}

/** localStorage key prefix for timeline state */
export const TIMELINE_STORAGE_KEY_PREFIX = "moodio-timeline-";

export function getTimelineStorageKey(desktopId: string): string {
  return `${TIMELINE_STORAGE_KEY_PREFIX}${desktopId}`;
}

export function getEffectiveDuration(clip: TimelineClip): number {
  const start = clip.trimStart ?? 0;
  const end = clip.trimEnd ?? clip.duration;
  return Math.max(0, end - start);
}
