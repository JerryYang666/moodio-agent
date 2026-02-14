"use client";

import React, { useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import type { QueryState } from "@/lib/redux/types";
import { useGetVideosQuery, useGetPropertiesQuery, type Video } from "@/lib/redux/services/api";
import { setCursor, setSearchId, setSelectedFilters } from "@/lib/redux/slices/querySlice";
import {
  JustifiedGallery,
  type Photo,
} from "@/components/browse/JustifiedGallery";
import { VirtualInfiniteScroll } from "@/components/browse/VirtualInfiniteScroll";
import { getVideoUrl } from "@/lib/config/video.config";
import { useInfiniteContent } from "@/lib/redux/hooks/useInfiniteContent";
import { VideoVisibilityProvider } from "@/hooks/use-video-visibility";
import { Loader2 } from "lucide-react";
import { addToast } from "@heroui/toast";

// Simple mapping function - dimensions come from API, no async loading needed
const videoToPhoto = (video: Video): Photo => ({
  src: getVideoUrl(video.storage_key),
  width: video.width,
  height: video.height,
  id: video.id,
  key: video.id.toString(),
  alt: video.content_uuid,
  videoName: video.content_uuid,
});

const VideoGrid: React.FC = () => {
  const dispatch = useDispatch();
  const queryState = useSelector((state: RootState) => state.query);

  // Fetch taxonomy properties for grouped filter contract
  const { data: properties = [] } = useGetPropertiesQuery();

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
        title: "Filters updated",
        description: `${removedCount} unavailable filter(s) removed. Refreshing results.`,
        color: "warning",
      });
    }
  }, [error, queryState.selectedFilters, dispatch]);

  // Direct mapping - dimensions come from API, no loading phase needed
  const photos = videos.map(videoToPhoto);

  // Handle photo click
  const handleClickPhoto = (photo: Photo) => {
    console.log("Photo clicked:", photo);
  };

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
        <div className="text-danger text-lg mb-2">Error loading videos</div>
        <p className="text-default-500 text-sm mb-4">
          There was a problem fetching the video results.
        </p>
        <button
          onClick={() => refetch()}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600"
        >
          Try Again
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
        <div className="text-default-500 text-lg mb-2">No videos found</div>
        <p className="text-default-400 text-sm">
          Try adjusting your search terms or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full">
      {/* Results summary */}
      <div className="mb-1 text-sm text-default-500 shrink-0">
        Showing {videos.length}
        {hasMore ? "+" : ""} of {totalItems} videos
        {queryState.textSearch.trim() && queryState.selectedFilters.length > 0 && (
          <span className="text-default-400"> · matching any selected filter</span>
        )}
      </div>

      {/* Video Grid with Custom Infinite Scroll */}
      <VirtualInfiniteScroll
        hasMore={hasMore}
        isLoading={isFetching}
        onLoadMore={handleLoadMore}
        threshold={800}
        resetKey={searchKey}
      >
        <VideoVisibilityProvider>
          <JustifiedGallery
            photos={photos}
            targetRowHeight={180}
            spacing={3}
            onClick={handleClickPhoto}
            hasMore={hasMore}
          />
        </VideoVisibilityProvider>
      </VirtualInfiniteScroll>
    </div>
  );
};

export default VideoGrid;
