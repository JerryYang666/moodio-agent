"use client";

import React, { useRef, useEffect, useCallback } from "react";

export interface VirtualInfiniteScrollProps {
  children: React.ReactNode;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  loader?: React.ReactNode;
  endMessage?: React.ReactNode;
  className?: string;
  threshold?: number; // Distance from bottom to trigger load (in pixels)
  useWindowScroll?: boolean; // Use window scroll instead of container scroll
  resetKey?: string; // When this changes, scroll position resets to top
}

/**
 * Custom infinite scroll component optimized for performance
 * - Uses IntersectionObserver for efficient scroll detection
 * - Maintains scroll position when new content loads
 * - Shows loading indicator only at the bottom
 * - Prevents multiple simultaneous loads
 */
export const VirtualInfiniteScroll: React.FC<VirtualInfiniteScrollProps> = ({
  children,
  hasMore,
  isLoading,
  onLoadMore,
  loader,
  endMessage,
  className = "",
  threshold = 800,
  useWindowScroll = false,
  resetKey,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastLoadTimeRef = useRef<number>(0);
  const previousResetKeyRef = useRef(resetKey);

  // Dead zone: minimum time between loads (ms) to prevent rapid-fire requests
  // This prevents infinite scroll from stalling if the sentinel briefly becomes
  // visible during layout shifts or rapid scrolling
  const DEAD_ZONE_MS = 300;

  // Reset scroll position when resetKey changes (e.g., new search/filter)
  useEffect(() => {
    if (previousResetKeyRef.current !== resetKey) {
      previousResetKeyRef.current = resetKey;
      if (useWindowScroll) {
        window.scrollTo({ top: 0 });
      } else if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    }
  }, [resetKey, useWindowScroll]);

  const handleLoadMore = useCallback(() => {
    // Prevent multiple simultaneous loads using isLoading from props
    // (don't use local loadingRef - it can get stuck if onLoadMore doesn't trigger a fetch)
    if (!hasMore || isLoading) {
      return;
    }

    // Dead zone safeguard: prevent rapid-fire loads
    const now = Date.now();
    if (now - lastLoadTimeRef.current < DEAD_ZONE_MS) {
      return;
    }

    lastLoadTimeRef.current = now;
    onLoadMore();
  }, [hasMore, isLoading, onLoadMore]);


  // Set up IntersectionObserver for the sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          handleLoadMore();
        }
      },
      {
        root: useWindowScroll ? null : containerRef.current,
        rootMargin: `${threshold}px`,
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, threshold, handleLoadMore, useWindowScroll]);

  // Fallback: continuously check if sentinel is visible when content doesn't fill viewport
  // This handles the case where content is short (e.g., wide screen with narrow videos)
  // and the IntersectionObserver doesn't re-trigger because the sentinel never leaves view
  useEffect(() => {
    if (!hasMore || isLoading) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let rafId: number | null = null;

    const checkAndLoad = () => {
      const sentinel = sentinelRef.current;
      const container = containerRef.current;
      if (!sentinel) return;

      const root = useWindowScroll ? null : container;
      const rootRect = root ? root.getBoundingClientRect() : {
        top: 0,
        bottom: window.innerHeight,
      };
      const sentinelRect = sentinel.getBoundingClientRect();

      // Check if sentinel is within viewport + threshold
      const isVisible = sentinelRect.top <= rootRect.bottom + threshold;

      if (isVisible) {
        // Bypass the dead zone for this fallback - call onLoadMore directly
        // The dead zone is meant to prevent rapid scroll triggers, but this fallback
        // only runs when content doesn't fill the viewport (no scrolling happening)
        onLoadMore();
      }
    };

    // Use requestAnimationFrame to ensure DOM is fully rendered before first check
    // This is critical for initial load when data just arrived
    rafId = requestAnimationFrame(() => {
      checkAndLoad();
      // Set up interval to keep checking until loading starts or content fills viewport
      intervalId = setInterval(checkAndLoad, DEAD_ZONE_MS + 100);
    });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [hasMore, isLoading, threshold, onLoadMore, useWindowScroll]);

  return (
    <div
      ref={containerRef}
      className={useWindowScroll ? className : `overflow-y-auto ${className}`}
      style={useWindowScroll ? { position: "relative" } : { height: "100%", position: "relative", overflowAnchor: "auto" as const }}
    >
      {children}

      {/* Sentinel element for intersection observer */}
      {hasMore && <div ref={sentinelRef} style={{ height: "1px" }} />}

      {/* Loading indicator */}
      {isLoading && hasMore && (
        <div className="text-center py-4">
          {loader || (
            <div className="text-gray-500 text-sm">Loading more videos...</div>
          )}
        </div>
      )}

      {/* End message */}
      {!hasMore && !isLoading && (
        <div className="text-center py-8">
          {endMessage || (
            <div className="text-gray-400 text-sm">
              You&apos;ve reached the end of the results
            </div>
          )}
        </div>
      )}
    </div>
  );
};
