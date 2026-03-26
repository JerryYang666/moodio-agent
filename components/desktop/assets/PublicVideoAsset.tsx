"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { PublicVideoAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { Video, Play, Pause, Maximize2 } from "lucide-react";

interface PublicVideoAssetProps {
  asset: EnrichedDesktopAsset;
  playing?: boolean;
  onPlayToggle?: () => void;
  onImageLoad: (
    assetId: string,
    naturalWidth: number,
    naturalHeight: number
  ) => void;
  onFocusAsset?: (asset: EnrichedDesktopAsset) => void;
  zoom: number;
}

export default function PublicVideoAsset({
  asset,
  playing,
  onPlayToggle,
  onImageLoad,
  onFocusAsset,
  zoom,
}: PublicVideoAssetProps) {
  const t = useTranslations("desktop");
  const meta = asset.metadata as unknown as PublicVideoAssetMeta;
  const videoUrl = asset.videoUrl;
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget;
      onImageLoad(asset.id, video.videoWidth, video.videoHeight);
    },
    [asset.id, onImageLoad]
  );

  const handleVideoEnded = useCallback(() => {
    onPlayToggle?.();
  }, [onPlayToggle]);

  const attemptPlay = useCallback(() => {
    if (!videoRef.current) return;
    const playPromise = videoRef.current.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Ignore autoplay promise rejection; asset still stays in playing mode.
      });
    }
  }, []);

  useEffect(() => {
    if (playing) {
      attemptPlay();
    }
  }, [playing, attemptPlay]);

  useEffect(() => {
    if (!playing && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [playing]);

  if (!videoUrl) {
    return (
      <div className="w-full h-full bg-default-200 flex flex-col items-center justify-center gap-2 p-4">
        <Video size={24} className="text-default-400" />
        <span className="text-xs text-default-400">
          {meta.title || t("videoTitle")}
        </span>
      </div>
    );
  }

  if (playing) {
    return (
      <>
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          muted
          loop={false}
          preload="auto"
          playsInline
          className="w-full h-full object-contain bg-black"
          onLoadedMetadata={attemptPlay}
          onCanPlay={attemptPlay}
          onEnded={handleVideoEnded}
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlayToggle?.();
            }}
            className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm"
          >
            <Pause size={18} className="text-white" />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <video
        ref={videoRef}
        src={videoUrl}
        preload="metadata"
        muted
        playsInline
        className="w-full h-full object-contain bg-black"
        onLoadedMetadata={handleLoadedMetadata}
      />

      {/* Play badge — top-left */}
      <div className="absolute top-2 left-2 z-10">
        <div className="bg-black/70 text-white rounded-full p-1 flex items-center gap-1">
          <Play size={10} fill="white" />
        </div>
      </div>

      {/* Focus button — top-right */}
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

      {/* Play button overlay on hover */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-1">
        <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
          <Play size={18} className="text-white" fill="white" />
        </div>
      </div>

      {/* Title on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1.5 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {meta.title || t("untitledVideo")}
      </div>
    </>
  );
}
