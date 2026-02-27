export type ImageAssetMeta = {
  imageId: string;
  chatId?: string;
  title?: string;
  prompt?: string;
  status?: string;
  modelId?: string;
};

export type VideoAssetMeta = {
  imageId: string;
  videoId: string;
  chatId?: string;
  title?: string;
  prompt?: string;
  status?: string;
  duration?: number;
};

export type TextAssetMeta = {
  content: string;
  fontSize?: number;
  color?: string;
};

export type LinkAssetMeta = {
  url: string;
  title?: string;
  thumbnailUrl?: string;
};

export type DesktopAssetMetadata =
  | { assetType: "image"; metadata: ImageAssetMeta }
  | { assetType: "video"; metadata: VideoAssetMeta }
  | { assetType: "text"; metadata: TextAssetMeta }
  | { assetType: "link"; metadata: LinkAssetMeta };

const SUPPORTED_ASSET_TYPES = ["image", "video", "text", "link"] as const;
export type SupportedAssetType = (typeof SUPPORTED_ASSET_TYPES)[number];

export function validateAssetMetadata(
  assetType: string,
  metadata: unknown
): { valid: true; assetType: SupportedAssetType } | { valid: false; error: string } {
  if (!SUPPORTED_ASSET_TYPES.includes(assetType as SupportedAssetType)) {
    return { valid: false, error: `Unsupported asset type: ${assetType}` };
  }

  if (!metadata || typeof metadata !== "object") {
    return { valid: false, error: "metadata must be a non-null object" };
  }

  const m = metadata as Record<string, unknown>;

  switch (assetType) {
    case "image":
      if (typeof m.imageId !== "string" || !m.imageId) {
        return { valid: false, error: "image metadata requires a non-empty imageId string" };
      }
      break;
    case "video":
      if (typeof m.imageId !== "string" || !m.imageId) {
        return { valid: false, error: "video metadata requires a non-empty imageId string" };
      }
      if (typeof m.videoId !== "string" || !m.videoId) {
        return { valid: false, error: "video metadata requires a non-empty videoId string" };
      }
      break;
    case "text":
      if (typeof m.content !== "string") {
        return { valid: false, error: "text metadata requires a content string" };
      }
      break;
    case "link":
      if (typeof m.url !== "string" || !m.url) {
        return { valid: false, error: "link metadata requires a non-empty url string" };
      }
      break;
  }

  return { valid: true, assetType: assetType as SupportedAssetType };
}
