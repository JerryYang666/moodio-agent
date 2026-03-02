"use client";

import { useRef, useCallback } from "react";
import type { VideoAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { Play, Pause, Loader2, Clock, AlertCircle, Video } from "lucide-react";
import { useVideo } from "@/components/video-provider";
import FakeProgressBar from "@/components/video/fake-progress-bar";
import VideoStatusOverlay from "@/components/video/video-status-overlay";
import type { VideoGenerationStatus } from "@/components/video-provider";

interface VideoAssetProps {
  asset: EnrichedDesktopAsset;
  playing?: boolean;
  onPlayToggle?: () => void;
  onImageLoad: (
    assetId: string,
    naturalWidth: number,
    naturalHeight: number
  ) => void;
}

export default function VideoAsset({
  asset,
  playing,
  onPlayToggle,
  onImageLoad,
}: VideoAssetProps) {
  const meta = asset.metadata as unknown as VideoAssetMeta;
  const src = asset.imageUrl;
  const videoUrl = asset.videoUrl;
  const genId = meta.generationId;
  const { generationStatuses } = useVideo();
  const videoRef = useRef<HTMLVideoElement>(null);

  const liveStatus = genId ? generationStatuses[genId] : undefined;
  const canonicalStatus = asset.generationData?.status || meta.status;
  const genStatus =
    canonicalStatus === "completed" || canonicalStatus === "failed"
      ? canonicalStatus
      : liveStatus || canonicalStatus;
  const isProcessing = genStatus === "pending" || genStatus === "processing";
  const isFailed = genStatus === "failed";
  const isCompleted = genStatus === "completed" || !!meta.videoId;
  const createdAt =
    asset.generationData?.createdAt || asset.addedAt?.toString();

  const handleVideoEnded = useCallback(() => {
    onPlayToggle?.();
  }, [onPlayToggle]);

  if (!src && !videoUrl) {
    return (
      <div className="w-full h-full bg-default-200 flex flex-col items-center justify-center gap-2 p-4 relative">
        {isProcessing && (
          <>
            <Loader2 size={24} className="text-primary animate-spin" />
            <span className="text-xs text-default-500">Generating...</span>
          </>
        )}
        {isFailed && (
          <>
            <AlertCircle size={24} className="text-danger" />
            <span className="text-xs text-danger">Failed</span>
          </>
        )}
        {!isProcessing && !isFailed && (
          <>
            <Video size={24} className="text-default-400" />
            <span className="text-xs text-default-400">
              {meta.title || "Video"}
            </span>
          </>
        )}
        {isProcessing && createdAt && (
          <FakeProgressBar
            status={genStatus as VideoGenerationStatus}
            createdAt={createdAt}
            className="absolute bottom-0 left-0 right-0 h-1 bg-default-200/60 z-10 overflow-hidden"
          />
        )}
      </div>
    );
  }

  // Inline video playback for completed videos
  if (playing && isCompleted && videoUrl) {
    return (
      <>
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop={false}
          playsInline
          className="w-full h-full object-contain bg-black"
          onEnded={handleVideoEnded}
        />
        {/* Pause button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-1">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Pause size={18} className="text-white" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <img
        src={src!}
        alt={meta.title || "Video"}
        draggable={false}
        className="w-full h-full object-contain"
        onLoad={(e) => {
          const img = e.currentTarget;
          onImageLoad(asset.id, img.naturalWidth, img.naturalHeight);
        }}
      />

      {/* Processing / pending / failed overlay */}
      {(isProcessing || isFailed) && (
        <VideoStatusOverlay
          status={genStatus as VideoGenerationStatus}
          iconClassName=""
        />
      )}

      {/* Status badge — top-left */}
      <div className="absolute top-2 left-2 z-10">
        {isProcessing ? (
          <div className="bg-primary/80 text-white rounded-full p-1.5 flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" />
            <span className="text-[9px] font-medium pr-0.5">
              {genStatus === "pending" ? "Queued" : "Processing"}
            </span>
          </div>
        ) : isFailed ? (
          <div className="bg-danger/80 text-white rounded-full p-1.5 flex items-center gap-1">
            <AlertCircle size={10} />
            <span className="text-[9px] font-medium pr-0.5">Failed</span>
          </div>
        ) : isCompleted ? (
          <div className="bg-black/70 text-white rounded-full p-1 flex items-center gap-1">
            <Play size={10} fill="white" />
          </div>
        ) : (
          <div className="bg-default-500/70 text-white rounded-full p-1.5 flex items-center gap-1">
            <Clock size={10} />
            <span className="text-[9px] font-medium pr-0.5">Pending</span>
          </div>
        )}
      </div>

      {/* Play button overlay on hover — completed only */}
      {isCompleted && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-1">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Play size={18} className="text-white" fill="white" />
          </div>
        </div>
      )}

      {/* Title on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1.5 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {meta.title || "Untitled video"}
      </div>

      {/* Progress bar */}
      {isProcessing && createdAt && (
        <FakeProgressBar
          status={genStatus as VideoGenerationStatus}
          createdAt={createdAt}
          className="absolute bottom-0 left-0 right-0 h-1 bg-default-200/60 z-10 overflow-hidden"
        />
      )}
    </>
  );
}
