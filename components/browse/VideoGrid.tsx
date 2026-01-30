"use client";

import React from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import type { QueryState } from "@/lib/redux/types";
import { useGetVideosQuery, type Video } from "@/lib/redux/services/api";
import { setCursor, setSearchId } from "@/lib/redux/slices/querySlice";
import {
  JustifiedGallery,
  type Photo,
} from "@/components/browse/JustifiedGallery";
import { VirtualInfiniteScroll } from "@/components/browse/VirtualInfiniteScroll";
import { getVideoUrl } from "@/lib/config/video.config";
import { useInfiniteContent } from "@/lib/redux/hooks/useInfiniteContent";
import { VideoVisibilityProvider } from "@/hooks/use-video-visibility";
import { Loader2 } from "lucide-react";

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
  const queryState = useSelector((state: RootState) => state.query);

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
  } = useInfiniteContent<Video, QueryState>({
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
    buildQueryParams: (state) => state,
    actions: { setCursor, setSearchId },
  });

  // Direct mapping - dimensions come from API, no loading phase needed
  const photos = videos.map(videoToPhoto);

  // Handle photo click
  const handleClickPhoto = (photo: Photo) => {
    console.log("Photo clicked:", photo);
  };

  // Error state
  if (error) {
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
