import { Maximize2 } from "lucide-react";
import type { ImageAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";

interface ImageAssetProps {
  asset: EnrichedDesktopAsset;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
  onFocusAsset?: (asset: EnrichedDesktopAsset) => void;
}

export default function ImageAsset({ asset, onImageLoad, onFocusAsset }: ImageAssetProps) {
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
      {onFocusAsset && (
        <button
          type="button"
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onFocusAsset(asset);
          }}
          title="Focus on asset"
        >
          <Maximize2 size={13} className="text-white" />
        </button>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1.5 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {meta.title || meta.prompt || "Untitled"}
      </div>
    </>
  );
}
