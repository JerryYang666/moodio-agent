import type { TimelineClip } from "@/components/timeline/types";

export interface RenderSegment {
  video_id: string;
  s3_key: string;
  start: number;
  end: number;
}

export interface RenderRequest {
  input_bucket: string;
  segments: RenderSegment[];
  output_format: string;
  output_bucket: string;
  output_key: string;
}

export const SUPPORTED_OUTPUT_FORMATS = ["mp4", "mov", "mkv", "webm"] as const;
export type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

/**
 * Extract the S3 key from a CloudFront video URL.
 *
 * URLs look like:
 *   https://d21vy2k61qfmgy.cloudfront.net/videos/c2068c7c-...?Expires=...
 *   https://cdn0.moodio.art/videos/a39abd99-...
 *
 * The S3 key is `videos/{uuid}` (no extension).
 */
export function deriveS3Key(clip: TimelineClip): string {
  if (!clip.videoUrl) {
    throw new Error(`Clip "${clip.title}" (${clip.id}) has no videoUrl`);
  }
  const pathname = new URL(clip.videoUrl).pathname;
  const segments = pathname.split("/").filter(Boolean);
  // pathname is /videos/{uuid} — reconstruct as S3 key
  if (segments.length >= 2 && segments[0] === "videos") {
    return `videos/${segments[1]}`;
  }
  // Fallback: use entire pathname without leading slash
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
}

export function buildRenderRequest(
  clips: TimelineClip[],
  desktopId: string,
  options: {
    outputFormat?: OutputFormat;
    inputBucket?: string;
    outputBucket?: string;
  } = {}
): RenderRequest {
  console.log("process.env.AWS_S3_BUCKET_NAME", process.env.AWS_S3_BUCKET_NAME);
  const {
    outputFormat = "mp4",
    inputBucket = process.env.AWS_S3_BUCKET_NAME || "moodio-agent-dev-1",
    outputBucket,
  } = options;

  const segments: RenderSegment[] = clips
    .filter((clip) => clip.videoUrl)
    .map((clip) => ({
      video_id: clip.assetId,
      s3_key: deriveS3Key(clip),
      start: clip.trimStart ?? 0,
      end: clip.trimEnd ?? clip.duration,
    }));

  if (segments.length === 0) {
    throw new Error("No clips with video URLs to export");
  }

  return {
    input_bucket: inputBucket,
    segments,
    output_format: outputFormat,
    output_bucket: outputBucket ?? inputBucket,
    output_key: `renders/${desktopId}/${Date.now()}.${outputFormat}`,
  };
}
