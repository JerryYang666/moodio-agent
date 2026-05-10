import type { DesktopAsset } from "@/lib/db/schema";

export interface EnrichedDesktopAsset extends DesktopAsset {
  imageUrl?: string | null;
  thumbnailSmUrl?: string | null;
  thumbnailMdUrl?: string | null;
  videoUrl?: string | null;
  /**
   * CloudFront signed URL for the video (expires after a short window). Used
   * by frame-capture on paused videos: the `<video>` element is loaded with
   * `crossOrigin="anonymous"` so the resulting canvas isn't tainted. The
   * regular `videoUrl` relies on CloudFront cookies that don't accompany
   * cross-origin requests, so we keep the two separate.
   */
  signedVideoUrl?: string | null;
  audioUrl?: string | null;
  generationData?: {
    generationId: string;
    status: string;
    videoId: string | null;
    modelId: string;
    params: Record<string, any>;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
}
