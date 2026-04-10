"use client";

import { useTranslations } from "next-intl";
import type { AudioAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { Maximize2 } from "lucide-react";
import AudioPlayer from "@/components/audio-player";

interface AudioAssetProps {
  asset: EnrichedDesktopAsset;
  onFocusAsset?: (asset: EnrichedDesktopAsset) => void;
  zoom: number;
}

export default function AudioAsset({
  asset,
  onFocusAsset,
  zoom,
}: AudioAssetProps) {
  const t = useTranslations("desktop");
  const meta = asset.metadata as unknown as AudioAssetMeta;
  const audioUrl = asset.audioUrl;

  return (
    <div
      className="w-full h-full bg-linear-to-br from-violet-500/20 to-purple-600/20 relative"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {audioUrl ? (
        <AudioPlayer src={audioUrl} variant="compact" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-xs text-default-400">
            {meta.title || "Audio"}
          </span>
        </div>
      )}

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
        {meta.title || "Audio"}
      </div>
    </div>
  );
}
