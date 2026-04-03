export interface AssetItem {
  id: string;
  collectionId: string;
  folderId?: string | null;
  imageId: string;
  assetId: string;
  assetType: "image" | "video" | "public_video" | "public_image";
  imageUrl: string;
  videoUrl?: string;
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
