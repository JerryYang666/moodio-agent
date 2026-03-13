export type PendingVideoSource = "upload" | "library" | "ai_generated" | "retrieval";

export interface PendingVideo {
  videoId: string;
  url: string;
  source: PendingVideoSource;
  title?: string;
  isUploading?: boolean;
  localPreviewUrl?: string;
}

export const MAX_PENDING_VIDEOS = 1;

export function canAddVideo(pendingVideos: PendingVideo[]): boolean {
  return pendingVideos.length < MAX_PENDING_VIDEOS;
}

export function hasUploadingVideos(pendingVideos: PendingVideo[]): boolean {
  return pendingVideos.some((v) => v.isUploading);
}
