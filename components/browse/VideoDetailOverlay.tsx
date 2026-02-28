"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import {
  GraduationCap,
  Search,
  Wand2,
  Crop,
  Download,
  Share2,
  X,
  ChevronDown,
} from "lucide-react";
import { JustifiedGallery, type Photo } from "./JustifiedGallery";
import { VideoVisibilityProvider } from "@/hooks/use-video-visibility";
import { MOCK_VIDEO_DETAIL, type VideoDetailData } from "./video-detail-data";

const ACTION_ICONS = {
  learn: GraduationCap,
  explore: Search,
  create: Wand2,
} as const;

interface MetadataItemProps {
  label: string;
  value: string;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <span className="block text-[13px] text-neutral-200 leading-snug">
        {value}
      </span>
    </div>
  );
}

interface VideoDetailOverlayProps {
  selectedPhoto: Photo;
  similarPhotos: Photo[];
  onClose: () => void;
  originRect: DOMRect | null;
  rightOffset?: number;
}

export function VideoDetailOverlay({
  selectedPhoto,
  similarPhotos,
  onClose,
  originRect,
  rightOffset = 0,
}: VideoDetailOverlayProps) {
  const detail: VideoDetailData = MOCK_VIDEO_DETAIL;
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoTargetRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [animationDone, setAnimationDone] = useState(!originRect);

  useEffect(() => {
    if (videoTargetRef.current) {
      const rect = videoTargetRef.current.getBoundingClientRect();
      setTargetRect(rect);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  const metadataLeft: MetadataItemProps[] = [
    { label: "Media Type", value: detail.metadata.mediaType },
    { label: "Genre", value: detail.metadata.genre },
    { label: "Aspect Ratio", value: detail.metadata.aspectRatio },
    { label: "Creative Entities", value: detail.metadata.creativeEntities },
    { label: "Creator/Director", value: detail.metadata.creatorDirector },
  ];

  const metadataCenter: MetadataItemProps[] = [
    { label: "Campaign", value: detail.metadata.campaign },
    { label: "Camera Movement", value: detail.metadata.cameraMovement },
    { label: "Video Playback Speed", value: detail.metadata.videoPlaybackSpeed },
    { label: "Shot Size", value: detail.metadata.shotSize },
    { label: "Shot Type", value: detail.metadata.shotType },
  ];

  const metadataRight: MetadataItemProps[] = [
    { label: "Camera Focus", value: detail.metadata.cameraFocus },
    { label: "Camera Angle", value: detail.metadata.cameraAngle },
    { label: "Camera Height", value: detail.metadata.cameraHeight },
    { label: "Lighting Setup", value: detail.metadata.lightingSetup },
    { label: "Subject Lighting", value: detail.metadata.subjectLighting },
  ];

  return (
    <motion.div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overflow-y-auto"
      style={{ right: rightOffset }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={handleBackdropClick}
    >
      <div className="min-h-full p-6 md:p-10">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-60 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X size={20} className="text-white" />
        </button>

        {/* Main content area */}
        <div className="max-w-5xl mx-auto">
          {/* Top section: Video + Info side by side */}
          <div className="flex flex-col lg:flex-row gap-6 mb-6">
            {/* Video player area */}
            <div className="lg:w-[55%] shrink-0">
              <div
                ref={videoTargetRef}
                className="relative rounded-lg overflow-hidden"
                style={{
                  aspectRatio: `${selectedPhoto.width} / ${selectedPhoto.height}`,
                }}
              >
                {/* The animated video that flies in from its grid position */}
                <motion.div
                  className={animationDone ? "w-full h-full" : ""}
                  initial={
                    originRect
                      ? {
                          position: "fixed",
                          top: originRect.top,
                          left: originRect.left,
                          width: originRect.width,
                          height: originRect.height,
                          zIndex: 100,
                          borderRadius: 0,
                        }
                      : { opacity: 0, scale: 0.9 }
                  }
                  animate={
                    originRect && targetRect
                      ? {
                          position: "fixed",
                          top: targetRect.top,
                          left: targetRect.left,
                          width: targetRect.width,
                          height: targetRect.height,
                          zIndex: 100,
                          borderRadius: 8,
                        }
                      : { opacity: 1, scale: 1 }
                  }
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 28,
                    mass: 1,
                  }}
                  onAnimationComplete={() => setAnimationDone(true)}
                  style={animationDone ? {} : {
                    aspectRatio: `${selectedPhoto.width} / ${selectedPhoto.height}`,
                  }}
                >
                  <video
                    src={selectedPhoto.src}
                    className="w-full h-full object-cover rounded-lg"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                </motion.div>

                {/* Video overlay controls */}
                <motion.div
                  className="absolute top-3 right-3 flex gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  {[Crop, Download, Share2].map((Icon, i) => (
                    <button
                      key={i}
                      className="p-2 rounded-md bg-black/50 hover:bg-black/70 transition-colors"
                    >
                      <Icon size={16} className="text-white" />
                    </button>
                  ))}
                </motion.div>

                {/* Collection selector at bottom of video */}
                <motion.div
                  className="absolute bottom-3 left-3 right-3 flex items-center gap-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                >
                  <button className="flex-1 flex items-center justify-between px-4 py-2 rounded-lg bg-black/50 hover:bg-black/70 transition-colors text-white text-sm">
                    <span>Select a collection</span>
                    <ChevronDown size={16} />
                  </button>
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-5"
                  >
                    Add
                  </Button>
                </motion.div>
              </div>
            </div>

            {/* Info panel */}
            <motion.div
              className="flex-1 min-w-0"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              {/* Title */}
              <h2 className="text-xl font-bold text-white mb-0.5">{detail.title}</h2>
              <p className="text-sm text-neutral-400 mb-4">{detail.source}</p>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 mb-5">
                {detail.actions.map((action) => {
                  const Icon = ACTION_ICONS[action.icon];
                  return (
                    <Button
                      key={action.label}
                      variant="bordered"
                      className="justify-center gap-3 items-center border-neutral-600 text-neutral-200 hover:bg-white/10 w-full"
                      startContent={<Icon size={18} />}
                    >
                      {action.label}
                    </Button>
                  );
                })}
              </div>

              {/* Topics label + chips */}
              <div className="mb-1">
                <span className="text-xs text-neutral-400">Topics to ask agent:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.topics.map((topic) => (
                  <Chip
                    key={topic.label}
                    size="sm"
                    variant="bordered"
                    className="border-neutral-600 text-neutral-300 text-[11px] cursor-pointer hover:bg-white/10"
                  >
                    &ldquo;{topic.label}&rdquo;
                  </Chip>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Metadata section */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-1 mb-8 px-1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
          >
            <div>
              {metadataLeft.map((item) => (
                <MetadataItem key={item.label} {...item} />
              ))}
            </div>
            <div>
              {metadataCenter.map((item) => (
                <MetadataItem key={item.label} {...item} />
              ))}
            </div>
            <div>
              {metadataRight.map((item) => (
                <MetadataItem key={item.label} {...item} />
              ))}
            </div>
          </motion.div>

          {/* Similar Shots */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.4 }}
          >
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400 mb-4">
              Similar Shots
            </h3>
            <VideoVisibilityProvider>
              <JustifiedGallery
                photos={similarPhotos}
                targetRowHeight={140}
                spacing={4}
              />
            </VideoVisibilityProvider>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
