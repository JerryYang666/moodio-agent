"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { VideoAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { Play, Pause, Loader2, Clock, AlertCircle, Video, Maximize2, Scan, Camera } from "lucide-react";
import { addToast } from "@heroui/toast";
import { useVideo } from "@/components/video-provider";
import FakeProgressBar from "@/components/video/fake-progress-bar";
import VideoStatusOverlay from "@/components/video/video-status-overlay";
import type { VideoGenerationStatus } from "@/components/video-provider";
import CanvasAssetImage from "./CanvasAssetImage";
import { uploadImage } from "@/lib/upload/client";

interface VideoAssetProps {
  asset: EnrichedDesktopAsset;
  containerWidth: number;
  playing?: boolean;
  onPlayToggle?: () => void;
  onImageLoad: (
    assetId: string,
    naturalWidth: number,
    naturalHeight: number
  ) => void;
  onFocusAsset?: (asset: EnrichedDesktopAsset) => void;
  onPreviewAsset?: (asset: EnrichedDesktopAsset) => void;
  zoom: number;
  /**
   * Called after the user clicks "Capture Frame" on a paused playing video.
   * The image has already been uploaded by the time this fires; the page is
   * expected to create a new image asset on the canvas next to `asset`.
   */
  onFrameCaptured?: (args: {
    sourceAsset: EnrichedDesktopAsset;
    imageId: string;
    imageUrl: string;
    width: number;
    height: number;
  }) => void;
}

export default function VideoAsset({
  asset,
  containerWidth,
  playing,
  onPlayToggle,
  onImageLoad,
  onFocusAsset,
  onPreviewAsset,
  zoom,
  onFrameCaptured,
}: VideoAssetProps) {
  const t = useTranslations("desktop");
  const tVideo = useTranslations("video");
  const meta = asset.metadata as unknown as VideoAssetMeta;
  const src = asset.imageUrl;
  // Prefer the signed URL for playback so the `<video crossOrigin="anonymous">`
  // frame-capture path stays untainted. Falls back to the normal videoUrl
  // (e.g., during live updates that haven't refetched yet).
  const signedVideoUrl = asset.signedVideoUrl;
  const videoUrl = signedVideoUrl || asset.videoUrl;
  const useCrossOrigin = !!signedVideoUrl;
  const genId = meta.generationId;
  const { generationStatuses } = useVideo();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Reset paused-state whenever the video unmounts (playing → false) so the
  // capture button doesn't linger on the next playback.
  useEffect(() => {
    if (!playing) setIsVideoPaused(false);
  }, [playing]);

  const videoId = meta.videoId;

  const handleCaptureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !onFrameCaptured) return;
    if (!video.videoWidth || !video.videoHeight) return;

    setIsCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
          "image/png",
          1.0
        );
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File([blob], `frame_capture_${timestamp}.png`, {
        type: "image/png",
      });

      const result = await uploadImage(file, {
        source: "frame-capture",
        sourceVideoId: videoId,
      });
      if (!result.success) throw new Error(result.error.message);

      onFrameCaptured({
        sourceAsset: asset,
        imageId: result.data.imageId,
        imageUrl: result.data.imageUrl,
        width: video.videoWidth,
        height: video.videoHeight,
      });

      addToast({ title: tVideo("frameCaptureSuccess"), color: "success" });
    } catch (error) {
      console.error("Frame capture failed:", error);
      addToast({ title: tVideo("frameCaptureFailed"), color: "danger" });
    } finally {
      setIsCapturing(false);
    }
  }, [asset, onFrameCaptured, videoId, tVideo]);

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
            <span className="text-xs text-default-500">{t("videoGenerating")}</span>
          </>
        )}
        {isFailed && (
          <>
            <AlertCircle size={24} className="text-danger" />
            <span className="text-xs text-danger">{t("videoFailed")}</span>
          </>
        )}
        {!isProcessing && !isFailed && (
          <>
            <Video size={24} className="text-default-400" />
            <span className="text-xs text-default-400">
              {meta.title || t("videoTitle")}
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
          controls
          crossOrigin={useCrossOrigin ? "anonymous" : undefined}
          className="w-full h-full object-contain bg-black"
          onEnded={handleVideoEnded}
          onPause={() => setIsVideoPaused(true)}
          onPlay={() => setIsVideoPaused(false)}
          // Prevent the asset-card pointerDown handler (in DesktopCanvas)
          // from starting a drag / treating this as an asset click, so the
          // native controls (play/pause, scrubber, volume) stay clickable.
          onPointerDown={(e) => e.stopPropagation()}
        />
        {/* Capture-frame button — shown when the user pauses. Matches the
            in-modal VideoPlayer behaviour; clicking uploads the current frame
            as a new image and asks the page to drop it onto the canvas next
            to this video. Scaled inverse-to-zoom so it stays hit-target sized
            regardless of canvas zoom. */}
        {isVideoPaused && onFrameCaptured && (
          <div
            className="absolute top-2 right-2 z-20"
            style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top right" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={isCapturing}
              onClick={(e) => {
                e.stopPropagation();
                void handleCaptureFrame();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary/90 backdrop-blur-sm shadow-lg text-white text-xs font-medium hover:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCapturing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
              {tVideo("frameCapture")}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <CanvasAssetImage
        asset={asset}
        containerWidth={containerWidth}
        zoom={zoom}
        alt={meta.title || t("videoTitle")}
        onImageLoad={onImageLoad}
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
              {genStatus === "pending" ? t("videoQueued") : t("videoProcessing")}
            </span>
          </div>
        ) : isFailed ? (
          <div className="bg-danger/80 text-white rounded-full p-1.5 flex items-center gap-1">
            <AlertCircle size={10} />
            <span className="text-[9px] font-medium pr-0.5">{t("videoFailed")}</span>
          </div>
        ) : isCompleted ? (
          <div className="bg-black/70 text-white rounded-full p-1 flex items-center gap-1">
            <Play size={10} fill="white" />
          </div>
        ) : (
          <div className="bg-default-500/70 text-white rounded-full p-1.5 flex items-center gap-1">
            <Clock size={10} />
            <span className="text-[9px] font-medium pr-0.5">{t("videoPending")}</span>
          </div>
        )}
      </div>

      {/* Preview + focus buttons — top-right */}
      {(onPreviewAsset || onFocusAsset) && (
        <div
          className="absolute top-0 right-0 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top right", margin: `${8 / zoom}px` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onPreviewAsset && (
            <button
              type="button"
              className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm hover:bg-black/80 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onPreviewAsset(asset);
              }}
              title="View fullscreen"
            >
              <Maximize2 size={13} className="text-white" />
            </button>
          )}
          {onFocusAsset && (
            <button
              type="button"
              className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm hover:bg-black/80 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onFocusAsset(asset);
              }}
              title="Focus on asset"
            >
              <Scan size={13} className="text-white" />
            </button>
          )}
        </div>
      )}

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
        {meta.title || t("untitledVideo")}
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
