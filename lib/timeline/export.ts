import type { TimelineClip } from "@/components/timeline/types";

/* ---- Client-side types (sent from browser to /api/render/export) ---- */

export interface ExportClipSegment {
  video_id: string;
  video_url: string;
  start: number;
  end: number;
}

export interface ExportRequest {
  segments: ExportClipSegment[];
  output_format: string;
  desktop_id: string;
}

/* ---- Server-side types (sent from API route to Lambda) ---- */

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

/* ---- Shared constants ---- */

export const SUPPORTED_OUTPUT_FORMATS = ["mp4", "mov", "mkv", "webm"] as const;
export type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

/* ---- Client helper: build the lightweight export request ---- */

export function buildExportRequest(
  clips: TimelineClip[],
  desktopId: string,
  outputFormat: OutputFormat = "mp4"
): ExportRequest {
  const segments: ExportClipSegment[] = clips
    .filter((clip) => clip.videoUrl)
    .map((clip) => ({
      video_id: clip.assetId,
      video_url: clip.videoUrl!,
      start: clip.trimStart ?? 0,
      end: clip.trimEnd ?? clip.duration,
    }));

  if (segments.length === 0) {
    throw new Error("No clips with video URLs to export");
  }

  return { segments, output_format: outputFormat, desktop_id: desktopId };
}

/* ---- Server helper: derive S3 key from a CloudFront / CDN video URL ---- */

/**
 * URLs look like:
 *   https://d21vy2k61qfmgy.cloudfront.net/videos/c2068c7c-...?Expires=...
 *   https://cdn0.moodio.art/videos/a39abd99-...
 *
 * The S3 key is `videos/{uuid}` (no extension).
 */
export function deriveS3Key(videoUrl: string): string {
  const pathname = new URL(videoUrl).pathname;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "videos") {
    return `videos/${parts[1]}`;
  }
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
}

/* ---- Server helper: convert client ExportRequest → Lambda RenderRequest ---- */

export function buildRenderRequest(
  exportReq: ExportRequest,
  inputBucket: string,
  outputBucket?: string
): RenderRequest {
  const bucket = outputBucket ?? inputBucket;

  const segments: RenderSegment[] = exportReq.segments.map((seg) => ({
    video_id: seg.video_id,
    s3_key: deriveS3Key(seg.video_url),
    start: seg.start,
    end: seg.end,
  }));

  return {
    input_bucket: inputBucket,
    segments,
    output_format: exportReq.output_format,
    output_bucket: bucket,
    output_key: `renders/${exportReq.desktop_id}/${Date.now()}.${exportReq.output_format}`,
  };
}
