import type { ImageAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";

interface ImageAssetProps {
  asset: EnrichedDesktopAsset;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
}

export default function ImageAsset({ asset, onImageLoad }: ImageAssetProps) {
  const meta = asset.metadata as unknown as ImageAssetMeta;
  const src = asset.imageUrl;

  if (!src) {
    return <div className="w-full h-full bg-default-200 animate-pulse" />;
  }

  return (
    <>
      <img
        src={src}
        alt={meta.title || "Image"}
        draggable={false}
        className="w-full h-full object-contain"
        onLoad={(e) => {
          const img = e.currentTarget;
          onImageLoad(asset.id, img.naturalWidth, img.naturalHeight);
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1.5 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {meta.title || meta.prompt || "Untitled"}
      </div>
    </>
  );
}
