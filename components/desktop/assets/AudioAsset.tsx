"use client";

import { useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { AudioAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { Play, Pause, Music, Maximize2 } from "lucide-react";

interface AudioAssetProps {
  asset: EnrichedDesktopAsset;
  playing?: boolean;
  onPlayToggle?: () => void;
  onFocusAsset?: (asset: EnrichedDesktopAsset) => void;
  zoom: number;
}

export default function AudioAsset({
  asset,
  playing,
  onPlayToggle,
  onFocusAsset,
  zoom,
}: AudioAssetProps) {
  const t = useTranslations("desktop");
  const meta = asset.metadata as unknown as AudioAssetMeta;
  const audioUrl = asset.audioUrl;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.addEventListener("ended", () => onPlayToggle?.());
    }
    if (playing) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [playing, audioUrl, onPlayToggle]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <div className="w-full h-full bg-linear-to-br from-violet-500/20 to-purple-600/20 flex flex-col items-center justify-center gap-2 relative">
      <Music size={32} className="text-violet-400" />
      <span className="text-xs text-default-500 truncate max-w-[90%] px-2">
        {meta.title || "Audio"}
      </span>

      {audioUrl && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-[1]">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
            {playing ? (
              <Pause size={18} className="text-white" />
            ) : (
              <Play size={18} className="text-white ml-0.5" fill="white" />
            )}
          </div>
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
