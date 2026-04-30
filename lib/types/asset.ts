export interface AssetItem {
  id: string;
  collectionId: string;
  folderId?: string | null;
  imageId: string;
  assetId: string;
  assetType: "image" | "video" | "public_video" | "public_image" | "audio";
  imageUrl: string;
  videoUrl?: string;
  audioUrl?: string;
  /** md WebP thumbnail variant (used for grid display; only populated for images). */
  thumbnailSmUrl?: string;
  thumbnailMdUrl?: string;
  chatId: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: string;
    imageUrl?: string;
    videoUrl?: string;
    source?: string;
    storageKey?: string;
    messageTimestamp?: string | number;
  };
  rating: number | null;
  addedAt: Date;
}
