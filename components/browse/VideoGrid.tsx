"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import type { RootState } from "@/lib/redux/store";
import type { QueryState } from "@/lib/redux/types";
import { useGetVideosQuery, useGetPropertiesQuery, type Video } from "@/lib/redux/services/api";
import { setCursor, setSearchId, setSelectedFilters } from "@/lib/redux/slices/querySlice";
import {
  JustifiedGallery,
  type Photo,
} from "@/components/browse/JustifiedGallery";
import { VirtualInfiniteScroll } from "@/components/browse/VirtualInfiniteScroll";
import { VideoDetailView } from "@/components/browse/VideoDetailView";
import { Squircle } from "@/components/Squircle";
import { getContentUrl } from "@/lib/config/video.config";
import { useUserSetting } from "@/lib/user-settings";
import { useInfiniteContent } from "@/lib/redux/hooks/useInfiniteContent";
import { VideoVisibilityProvider } from "@/hooks/use-video-visibility";
import { Loader2 } from "lucide-react";
import { addToast } from "@heroui/toast";
import { normalizeMediaType } from "@/lib/media";

const videoToPhoto = (video: Video, cnMode: boolean = false): Photo => ({
  src: getContentUrl(video.storage_key, cnMode),
  width: video.width,
  height: video.height,
  id: video.id,
  key: video.id.toString(),
  alt: video.content_uuid,
  videoName: video.content_uuid,
  mediaType: normalizeMediaType(video.content_type),
});

interface VideoGridProps {
  hideSummary?: boolean;
  desktopId?: string;
  descriptionSlot?: React.ReactNode;
  onPhotoClickOverride?: (photo: Photo) => void;
}

const VideoGrid: React.FC<VideoGridProps> = ({ hideSummary = false, desktopId, descriptionSlot, onPhotoClickOverride }) => {
  const t = useTranslations("browse");
  const locale = useLocale();
  const dispatch = useDispatch();
  const cnMode = useUserSetting("cnMode");
  const queryState = useSelector((state: RootState) => state.query);

  // Video detail state
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isFlying, setIsFlying] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);

  // Fetch taxonomy properties for grouped filter contract
  const { data: properties = [] } = useGetPropertiesQuery(locale);

  // Track stale-filter recovery to prevent repeated loops
  const recoveryKeyRef = useRef<string>("");
  // Track if we are in recovery mode (show spinner instead of error)
  const isRecoveringRef = useRef(false);

  // Use the generic infinite content hook for pagination and accumulation
  const {
    items: videos,
    hasMore,
    totalItems,
    isLoading: isInitialLoading,
    isFetching,
    error,
    refetch,
    loadMore: handleLoadMore,
    searchKey,
  } = useInfiniteContent<Video, { queryState: QueryState; properties: typeof properties }>({
    useQuery: (params, options) => {
      const result = useGetVideosQuery(params, options);
      const transformData = (data: typeof result.data) => data ? {
        content: data.content,
        has_more: data.has_more,
        total_content: data.total_content,
        cursor: data.cursor,
        search_id: data.search_id,
      } : undefined;
      return {
        ...result,
        data: transformData(result.data),
        currentData: transformData(result.currentData),
      };
    },
    queryState,
    buildQueryParams: (state) => ({ queryState: state, properties }),
    actions: { setCursor, setSearchId },
  });

  // Handle backend 400 stale-filter recovery
  // Parse hidden_filter_ids / missing_filter_ids from error payload,
  // auto-sanitize selectedFilters, and show toast.
  useEffect(() => {
    if (!error) {
      isRecoveringRef.current = false;
      return;
    }

    // Extract stale filter IDs from the error payload
    // RTK Query wraps fetch errors in { status, data } shape
    const errorData = (error as { status?: number; data?: Record<string, unknown> })?.data;
    const status = (error as { status?: number })?.status;

    if (status !== 400 || !errorData) return;

    const hiddenIds = (errorData.hidden_filter_ids as number[] | undefined) ?? [];
    const missingIds = (errorData.missing_filter_ids as number[] | undefined) ?? [];
    const staleIds = [...hiddenIds, ...missingIds];

    if (staleIds.length === 0) return;

    // Build a recovery key to avoid repeated loops for the same (selectedFilters, staleIds)
    const key = `${queryState.selectedFilters.join(",")}-stale:${staleIds.sort().join(",")}`;
    if (recoveryKeyRef.current === key) return;
    recoveryKeyRef.current = key;

    // Sanitize selected filters
    const staleSet = new Set(staleIds);
    const sanitized = queryState.selectedFilters.filter((id) => !staleSet.has(id));
    const removedCount = queryState.selectedFilters.length - sanitized.length;

    if (removedCount > 0) {
      isRecoveringRef.current = true;
      dispatch(setSelectedFilters(sanitized));

      addToast({
        title: t("filtersUpdated"),
        description: t("filtersRemovedRefreshing", { count: removedCount }),
        color: "warning",
      });
    }
  }, [error, queryState.selectedFilters, dispatch]);

  // Direct mapping - dimensions come from API, no loading phase needed
  const photos = videos.map((v) => videoToPhoto(v, cnMode));

  // Handle photo click — capture rect, start the flying clone
  const handleClickPhoto = useCallback((photo: Photo) => {
    if (onPhotoClickOverride) {
      onPhotoClickOverride(photo);
      return;
    }
    const videoEl = galleryRef.current?.querySelector(
      `[data-photo-key="${photo.key}"]`
    );
    if (videoEl) {
      setOriginRect(videoEl.getBoundingClientRect());
      setIsFlying(true);
    } else {
      setOriginRect(null);
    }
    setSelectedPhoto(photo);
  }, [onPhotoClickOverride]);

  const handleCloseDetail = useCallback(() => {
    setSelectedPhoto(null);
    setOriginRect(null);
    setTargetRect(null);
    setIsFlying(false);
  }, []);

  // Called by VideoDetailView once its target container is measured
  const handleTargetReady = useCallback((rect: DOMRect) => {
    setTargetRect(rect);
  }, []);

  // Called when the flying clone finishes its animation
  const handleFlyComplete = useCallback(() => {
    setIsFlying(false);
  }, []);

  // During stale-filter recovery, show spinner instead of generic error
  if (isRecoveringRef.current && (isFetching || isInitialLoading)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-default-500" />
      </div>
    );
  }

  // Error state - but not if it's a stale-filter 400 we're about to recover from
  if (error && !isRecoveringRef.current) {
    const status = (error as { status?: number })?.status;
    const errorData = (error as { data?: Record<string, unknown> })?.data;
    const isStaleFilterError =
      status === 400 &&
      errorData &&
      (Array.isArray(errorData.hidden_filter_ids) || Array.isArray(errorData.missing_filter_ids));

    // If it's a stale-filter error, show spinner while recovery effect runs
    if (isStaleFilterError) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-default-500" />
        </div>
      );
    }

    return (
      <div className="text-center py-12">
        <div className="text-danger text-lg mb-2">{t("errorLoadingVideos")}</div>
        <p className="text-default-500 text-sm mb-4">
          {t("errorLoadingVideosDesc")}
        </p>
        <button
          onClick={() => refetch()}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600"
        >
          {t("tryAgain")}
        </button>
      </div>
    );
  }

  // Loading state - simple spinner instead of fake skeleton
  if (videos.length === 0 && (isInitialLoading || isFetching)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-default-500" />
      </div>
    );
  }

  // Empty state
  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-default-500 text-lg mb-2">{t("noVideosFound")}</div>
        <p className="text-default-400 text-sm">
          {t("noVideosFoundDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full">
      {/* Results summary — sticky at the top, hidden when detail is open */}
      {!hideSummary && !selectedPhoto && (
        <div className="mb-1 text-xs text-default-500 shrink-0 bg-background py-1">
          {t("showingCount", { current: videos.length, more: hasMore ? "+" : "", total: totalItems })}
          {queryState.textSearch.trim() && queryState.selectedFilters.length > 0 && (
            <span className="text-default-400"> · {t("matchingAnyFilter")}</span>
          )}
        </div>
      )}

      {selectedPhoto ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <VideoDetailView
            selectedPhoto={selectedPhoto}
            onClose={handleCloseDetail}
            onTargetReady={handleTargetReady}
            videoVisible={!isFlying}
            desktopId={desktopId}
          />
        </div>
      ) : (
        <VirtualInfiniteScroll
          hasMore={hasMore}
          isLoading={isFetching}
          onLoadMore={handleLoadMore}
          threshold={800}
          resetKey={searchKey}
        >
          {/* Label description scrolls with the content */}
          {descriptionSlot}
          <VideoVisibilityProvider>
            <div ref={galleryRef}>
              <JustifiedGallery
                photos={photos}
                spacing={6}
                onClick={handleClickPhoto}
                hasMore={hasMore}
              />
            </div>
          </VideoVisibilityProvider>
        </VirtualInfiniteScroll>
      )}

      {/* Flying clone — sits above everything, animates from grid position to detail position */}
      {isFlying && selectedPhoto && originRect && (
        <motion.div
          style={{
            position: "fixed",
            zIndex: 100,
            aspectRatio: `${selectedPhoto.width} / ${selectedPhoto.height}`,
          }}
          initial={{
            top: originRect.top,
            left: originRect.left,
            width: originRect.width,
            height: originRect.height,
          }}
          animate={
            targetRect
              ? {
                  top: targetRect.top,
                  left: targetRect.left,
                  width: targetRect.width,
                  height: targetRect.height,
                }
              : undefined
          }
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 28,
            mass: 1,
          }}
          onAnimationComplete={handleFlyComplete}
        >
          <Squircle className="w-full h-full overflow-hidden">
            {selectedPhoto.mediaType === "image" ? (
              <img
                src={selectedPhoto.src}
                alt={selectedPhoto.alt}
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={selectedPhoto.src}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            )}
          </Squircle>
        </motion.div>
      )}
    </div>
  );
};

export default VideoGrid;
