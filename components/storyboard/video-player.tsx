"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { Camera, Loader2, Clock, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { addToast } from "@heroui/toast";

interface VideoPlayerProps {
  videoUrl: string | null;
  signedVideoUrl: string | null; // Signed URL for frame capture (CORS-compatible)
  thumbnailUrl: string | null;
  fallbackImageUrl: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoId?: string;
  onFrameCaptured?: (imageId: string, imageUrl: string) => void;
}

export default function VideoPlayer({
  videoUrl,
  signedVideoUrl,
  thumbnailUrl,
  fallbackImageUrl,
  status,
  videoId,
  onFrameCaptured,
}: VideoPlayerProps) {
  const t = useTranslations("video");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Reset paused state when video URL changes
  useEffect(() => {
    setIsVideoPaused(false);
  }, [videoUrl]);

  // Frame capture function using Canvas API
  // We capture from the video element directly - this works because we're not
  // using crossOrigin attribute (which would require CORS headers from CloudFront)
  const captureFrame = async (video: HTMLVideoElement): Promise<File> => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    // Draw the current video frame to canvas
    // Note: This will fail with "tainted canvas" error if crossOrigin is set
    // but CloudFront doesn't return CORS headers. We avoid this by not setting crossOrigin.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Failed to create blob"));
        },
        "image/png",
        1.0
      );
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([blob], `frame_capture_${timestamp}.png`, { type: "image/png" });
  };

  // Handle frame capture button click
  const handleFrameCapture = async () => {
    const video = videoRef.current;
    if (!video) return;

    setIsCapturing(true);

    try {
      // Step 1: Capture the frame
      const file = await captureFrame(video);

      // Step 2: Get presigned URL
      const presignResponse = await fetch("/api/image/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: file.type,
          contentLength: file.size,
          filename: file.name,
        }),
      });

      if (!presignResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { imageId, uploadUrl } = await presignResponse.json();

      // Step 3: Upload directly to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "Content-Length": file.size.toString(),
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload to storage");
      }

      // Step 4: Confirm upload to "My Frame Captures" collection
      const confirmResponse = await fetch("/api/image/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          filename: file.name,
          source: "frame-capture",
          sourceVideoId: videoId,
        }),
      });

      if (!confirmResponse.ok) {
        throw new Error("Failed to confirm upload");
      }

      const { imageUrl } = await confirmResponse.json();

      // Show success toast
      addToast({
        title: t("frameCaptureSuccess"),
        color: "success",
      });

      // Notify parent component
      onFrameCaptured?.(imageId, imageUrl);
    } catch (error) {
      console.error("Frame capture failed:", error);
      addToast({
        title: t("frameCaptureFailed"),
        color: "danger",
      });
    } finally {
      setIsCapturing(false);
    }
  };

  // Render completed video with player
  // Use signedVideoUrl with crossOrigin="anonymous" for CORS-compatible frame capture
  // Fall back to regular videoUrl if signed URL is not available
  if (status === "completed" && (signedVideoUrl || videoUrl)) {
    const effectiveVideoUrl = signedVideoUrl || videoUrl;
    const useCrossOrigin = !!signedVideoUrl; // Only use crossOrigin with signed URLs
    
    return (
      <div className="rounded-lg overflow-hidden bg-black relative">
        <video
          ref={videoRef}
          src={effectiveVideoUrl!}
          controls
          autoPlay
          playsInline
          crossOrigin={useCrossOrigin ? "anonymous" : undefined}
          className="w-full max-h-[40vh] sm:max-h-[60vh]"
          onPause={() => setIsVideoPaused(true)}
          onPlay={() => setIsVideoPaused(false)}
          onEnded={() => setIsVideoPaused(true)}
        />
        {/* Frame Capture Button - visible when paused */}
        <AnimatePresence>
          {isVideoPaused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="absolute top-2 right-2 z-10"
            >
              <Button
                size="sm"
                color="primary"
                variant="solid"
                className="bg-primary/90 backdrop-blur-sm shadow-lg"
                startContent={!isCapturing && <Camera size={16} />}
                isLoading={isCapturing}
                onPress={handleFrameCapture}
              >
                {t("frameCapture")}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Render preview/placeholder for non-completed videos
  return (
    <div className="rounded-lg overflow-hidden bg-black">
      <div className="aspect-video flex items-center justify-center relative">
        <Image
          src={thumbnailUrl || fallbackImageUrl}
          alt={t("thumbnailAlt")}
          classNames={{
            wrapper: "w-full h-full",
            img: "w-full h-full object-contain",
          }}
        />
        {status !== "completed" && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            {status === "processing" && (
              <Loader2
                size={32}
                className="sm:w-12 sm:h-12 text-white animate-spin"
              />
            )}
            {status === "pending" && (
              <Clock
                size={32}
                className="sm:w-12 sm:h-12 text-white"
              />
            )}
            {status === "failed" && (
              <XCircle
                size={32}
                className="sm:w-12 sm:h-12 text-danger"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
