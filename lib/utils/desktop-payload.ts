import type { AssetItem } from "@/lib/types/asset";

export function buildDesktopSendPayload(
  asset: AssetItem
): { assetType: AssetItem["assetType"]; metadata: Record<string, unknown> } {
  const title = asset.generationDetails?.title || "";
  const prompt = asset.generationDetails?.prompt || "";
  const status = asset.generationDetails?.status || "";

  switch (asset.assetType) {
    case "public_video":
      return {
        assetType: "public_video",
        metadata: { storageKey: asset.assetId, contentUuid: asset.imageId, title },
      };
    case "public_image":
      return {
        assetType: "public_image",
        metadata: { storageKey: asset.assetId, contentUuid: asset.imageId, title },
      };
    case "video":
      return {
        assetType: "video",
        metadata: {
          imageId: asset.imageId,
          videoId: asset.assetId,
          chatId: asset.chatId,
          title,
          prompt,
          status,
        },
      };
    default:
      return {
        assetType: asset.assetType,
        metadata: {
          imageId: asset.imageId,
          chatId: asset.chatId,
          title,
          prompt,
          status,
        },
      };
  }
}
