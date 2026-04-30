import type { DesktopAsset } from "@/lib/db/schema";

export interface EnrichedDesktopAsset extends DesktopAsset {
  imageUrl?: string | null;
  thumbnailSmUrl?: string | null;
  thumbnailMdUrl?: string | null;
  videoUrl?: string | null;
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
