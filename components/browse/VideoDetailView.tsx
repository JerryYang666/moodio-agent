"use client";

import React, { useRef, useLayoutEffect, useEffect, useMemo } from "react";
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
  ArrowLeft,
} from "lucide-react";
import { JustifiedGallery, type Photo } from "./JustifiedGallery";
import { Squircle } from "@/components/Squircle";
import { VideoVisibilityProvider } from "@/hooks/use-video-visibility";
import { MOCK_VIDEO_DETAIL, type VideoDetailData } from "./video-detail-data";
import { useGetVideoDetailQuery, type ContentLabel } from "@/lib/redux/services/api";

const ACTION_ICONS = {
  learn: GraduationCap,
  explore: Search,
  create: Wand2,
} as const;

/**
 * Groups labels by the last 2 levels of their property_path.
 * e.g. "Camera Movement.Zoom" -> "Camera Movement > Zoom"
 * Single-level paths like "Lighting" stay as-is.
 * Labels with null property_path are grouped under "Other".
 */
function groupLabelsByProperty(labels: ContentLabel[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const label of labels) {
    const path = label.property_path;
    if (!path) {
      (groups["Other"] ??= []).push(label.value);
      continue;
    }
    const segments = path.split(".");
    const groupKey = segments.slice(-2).join(" > ");
    (groups[groupKey] ??= []).push(label.value);
  }
  return groups;
}

interface MetadataItemProps {
  label: string;
  value: string;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-default-400 dark:text-default-500">
        {label}
      </span>
      <span className="block text-[13px] text-default-700 dark:text-default-600 leading-snug">
        {value}
      </span>
    </div>
  );
}

interface VideoDetailViewProps {
  selectedPhoto: Photo;
  similarPhotos: Photo[];
  onClose: () => void;
  onTargetReady: (rect: DOMRect) => void;
  videoVisible: boolean;
}

export function VideoDetailView({
  selectedPhoto,
  similarPhotos,
  onClose,
  onTargetReady,
  videoVisible,
}: VideoDetailViewProps) {
  const detail: VideoDetailData = MOCK_VIDEO_DETAIL;
  const videoTargetRef = useRef<HTMLDivElement>(null);
  const { data: videoDetail, isLoading: isLoadingDetail } = useGetVideoDetailQuery(selectedPhoto.id);

  const groupedLabels = useMemo(() => {
    if (!videoDetail?.labels) return {};
    return groupLabelsByProperty(videoDetail.labels);
  }, [videoDetail?.labels]);

  const labelEntries = useMemo(() => Object.entries(groupedLabels), [groupedLabels]);

  // Measure after layout but before paint for accurate rect
  useLayoutEffect(() => {
    if (videoTargetRef.current) {
      onTargetReady(videoTargetRef.current.getBoundingClientRect());
    }
  }, [onTargetReady]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="w-full">
      {/* Back button */}
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 text-sm text-default-500 hover:text-default-700 dark:text-default-500 dark:hover:text-default-700 transition-colors mb-4"
      >
        <ArrowLeft size={16} />
        <span>Back to results</span>
      </button>

      {/* Top section: Video + Info side by side */}
      <div className="flex flex-col lg:flex-row gap-6 mb-6">
        {/* Video player area */}
        <div className="lg:w-[55%] shrink-0">
          <Squircle
            ref={videoTargetRef}
            className="relative overflow-hidden"
            style={{
              aspectRatio: `${selectedPhoto.width} / ${selectedPhoto.height}`,
            }}
          >
            {/* Inline video — invisible while clone flies, instant visible when clone arrives */}
            <div className={`w-full h-full ${videoVisible ? "visible" : "invisible"}`}>
              <video
                src={selectedPhoto.src}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            </div>

            {/* Video overlay controls */}
            <motion.div
              className="absolute top-3 right-3 flex gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.2 }}
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
          </Squircle>
        </div>

        {/* Info panel */}
        <motion.div
          className="flex-1 min-w-0"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <h2 className="text-xl font-bold text-foreground mb-0.5">{detail.title}</h2>
          <p className="text-sm text-default-400 dark:text-default-500 mb-4">{detail.source}</p>

          <div className="flex flex-col gap-2 mb-5">
            {detail.actions.map((action) => {
              const Icon = ACTION_ICONS[action.icon];
              return (
                <Button
                  key={action.label}
                  variant="bordered"
                  className="justify-center gap-3 items-center border-default-300 dark:border-default-500 text-default-700 dark:text-default-600 hover:bg-default-100 dark:hover:bg-white/10 w-full"
                  startContent={<Icon size={18} />}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>

          <div className="mb-1">
            <span className="text-xs text-default-400 dark:text-default-500">Topics to ask agent:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detail.topics.map((topic) => (
              <Chip
                key={topic.label}
                size="sm"
                variant="bordered"
                className="border-default-300 dark:border-default-500 text-default-600 dark:text-default-600 text-[11px] cursor-pointer hover:bg-default-100 dark:hover:bg-white/10"
              >
                &ldquo;{topic.label}&rdquo;
              </Chip>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Metadata section — labels from API, grouped by property */}
      <motion.div
        className="mb-8 px-1 max-h-[320px] overflow-y-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        {isLoadingDetail ? (
          <div className="text-sm text-default-400">Loading metadata…</div>
        ) : labelEntries.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-1">
            {labelEntries.map(([group, values]) => (
              <MetadataItem key={group} label={group} value={values.join(", ")} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-default-400">No labels available</div>
        )}
      </motion.div>

      {/* Similar Shots */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        <h3 className="text-sm font-semibold uppercase tracking-widest text-default-400 dark:text-default-500 mb-4">
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
  );
}
