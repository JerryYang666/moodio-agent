"use client";

import React, { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react";
import { useVideoVisibility } from "@/hooks/use-video-visibility";
import { useTabVisibility } from "@/hooks/use-tab-visibility";

export interface LazyVideoProps {
    /** Video source URL */
    src: string;
    /** Video width in pixels */
    width: number;
    /** Video height in pixels */
    height: number;
    /** Additional CSS classes */
    className?: string;
    /** Click handler */
    onClick?: () => void;
}

/**
 * A video element that only loads and plays when visible in the viewport.
 * Uses IntersectionObserver for efficient visibility detection and respects
 * tab visibility to pause videos when the tab is hidden.
 * 
 * Three-zone visibility system:
 * - Far zone (>800px from viewport): src unloaded to release browser resources
 * - Near zone (300px buffer): src loaded, video preloading
 * - Visible zone (in viewport): video playing
 * 
 * Shows a skeleton placeholder until video data is loaded.
 * Must be used within a VideoVisibilityProvider context.
 */
export function LazyVideo({
    src,
    width,
    height,
    className = "",
    onClick,
}: LazyVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { isVisible, isNearViewport, isFarFromViewport } = useVideoVisibility(videoRef);
    const isTabVisible = useTabVisibility();

    // Track whether video has loaded enough data to display
    const [isLoaded, setIsLoaded] = useState(false);

    // Track whether we've set the src to avoid unnecessary reloads
    const hasSrcRef = useRef(false);

    // Track previous tab visibility to detect tab resume (false → true transition)
    const prevTabVisibleRef = useRef(isTabVisible);

    // Synchronously check visibility on mount to fix race condition with initial videos
    // This runs before paint, ensuring videos in the initial viewport get their src set immediately
    useLayoutEffect(() => {
        const video = videoRef.current;
        if (!video || hasSrcRef.current) return;

        // Synchronously calculate if video is near viewport
        const rect = video.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const rootMarginPx = 450; // Match the nearMargin in VideoVisibilityProvider

        const isInitiallyNearViewport =
            rect.bottom >= -rootMarginPx && rect.top <= viewportHeight + rootMarginPx;

        if (isInitiallyNearViewport) {
            video.src = src;
            hasSrcRef.current = true;
        }
    }, [src]);

    // Handle src UNLOADING when video enters far zone
    // This releases browser media resources for videos far from viewport
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isFarFromViewport && hasSrcRef.current) {
            // Unload the video to release browser resources
            video.pause();
            video.removeAttribute('src');
            video.load(); // Forces browser to release media resources
            hasSrcRef.current = false;
            setIsLoaded(false); // Show skeleton again when re-entering
        }
    }, [isFarFromViewport]);

    // Handle src loading when video enters near-viewport zone (for scrolling)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isNearViewport && !hasSrcRef.current) {
            // Set src when entering the preload zone
            video.src = src;
            hasSrcRef.current = true;
        }
    }, [isNearViewport, src]);

    // Handle play/pause based on visibility and tab state
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !hasSrcRef.current) return;

        const shouldPlay = isVisible && isTabVisible;
        const isTabResume = isTabVisible && !prevTabVisibleRef.current;
        prevTabVisibleRef.current = isTabVisible;

        if (shouldPlay) {
            const playVideo = () => {
                video.play().catch((error) => {
                    if (error.name !== "AbortError") {
                        console.debug("Video autoplay prevented:", error.message);
                    }
                });
            };

            if (isTabResume) {
                // Stagger play calls on tab resume to avoid overwhelming the browser's
                // media pipeline with 30-40+ simultaneous codec re-initializations
                const delay = Math.random() * 200;
                const timeoutId = setTimeout(playVideo, delay);
                return () => clearTimeout(timeoutId);
            } else {
                playVideo();
            }
        } else {
            // Pause the video when not visible or tab hidden
            video.pause();
        }
    }, [isVisible, isTabVisible]);

    // Handle video error
    const handleError = useCallback(() => {
        console.error(`Failed to load video: ${src}`);
        if (videoRef.current) {
            videoRef.current.style.backgroundColor = "#f3f4f6";
        }
    }, [src]);

    return (
        <div
            className={`relative overflow-hidden shrink-0 bg-neutral-300 dark:bg-neutral-700 ${className}`}
            style={{ width, height }}
        >
            {/* Skeleton overlay - pulses until video is loaded */}
            {!isLoaded && (
                <div className="absolute inset-0 bg-neutral-300 dark:bg-neutral-700 animate-pulse" />
            )}
            <video
                ref={videoRef}
                // src is set dynamically via useEffect when near viewport
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                }}
                onClick={onClick}
                onError={handleError}
                onLoadedData={() => setIsLoaded(true)}
                className={`cursor-pointer transition-opacity duration-300 ${isLoaded ? "opacity-100 hover:opacity-80" : "opacity-0"
                    }`}
                loop
                muted
                playsInline
                preload="metadata"
            />
        </div>
    );
}
