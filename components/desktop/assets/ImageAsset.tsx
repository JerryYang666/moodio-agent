import { Maximize2 } from "lucide-react";
import type { ImageAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import CanvasAssetImage from "./CanvasAssetImage";

interface ImageAssetProps {
  asset: EnrichedDesktopAsset;
  containerWidth: number;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
  onFocusAsset?: (asset: EnrichedDesktopAsset) => void;
  zoom: number;
}

export default function ImageAsset({ asset, containerWidth, onImageLoad, onFocusAsset, zoom }: ImageAssetProps) {
  const meta = asset.metadata as unknown as ImageAssetMeta;

  if (!asset.imageUrl) {
    return <div className="w-full h-full bg-default-200 animate-pulse" />;
  }

  return (
    <>
      <CanvasAssetImage
        asset={asset}
        containerWidth={containerWidth}
        zoom={zoom}
        alt={meta.title || "Image"}
        onImageLoad={onImageLoad}
      />
      {onFocusAsset && (
        <button
          type="button"
          className="absolute top-0 right-0 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top right", margin: `${8 / zoom}px` }}
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
