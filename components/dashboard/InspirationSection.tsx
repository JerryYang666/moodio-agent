"use client";

import React, { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { useTranslations, useLocale } from "next-intl";
import { setTextSearch, clearFilters } from "@/lib/redux/slices/querySlice";
import { useGetInspirationQuery } from "@/lib/redux/services/api";
import VideoGrid from "@/components/browse/VideoGrid";
import { Sparkles } from "lucide-react";

export function InspirationSection() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const dispatch = useDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { data: inspirationData, isLoading, isError } = useGetInspirationQuery(locale);

  useEffect(() => {
    if (inspirationData?.term) {
      dispatch(clearFilters());
      dispatch(setTextSearch(inspirationData.term));
    } else if (isError) {
      dispatch(clearFilters());
      dispatch(setTextSearch("beautiful cinematic"));
    }
  }, [inspirationData, isError, dispatch]);

  const searchTerm = inspirationData?.term || (isError ? "beautiful cinematic" : "");

  // Auto-scroll effect
  useEffect(() => {
    if (isLoading || !searchTerm) return;

    let animationFrameId: number;
    let lastTime = 0;
    const speed = 0.5; // pixels per frame
    let isHovering = false;
    let scrollContainer: Element | null = null;
    let exactScrollTop = 0;

    const animateScroll = (time: number) => {
      animationFrameId = requestAnimationFrame(animateScroll);

      if (isHovering) {
        lastTime = time;
        return;
      }

      if (!scrollContainer && containerRef.current) {
        scrollContainer = containerRef.current.querySelector(".overflow-y-auto");
        if (scrollContainer) {
          exactScrollTop = scrollContainer.scrollTop;
        }
      }

      if (scrollContainer && lastTime !== 0) {
        const delta = time - lastTime;
        // Scroll down slowly using an exact float, otherwise scrollTop truncates < 1px additions to 0
        exactScrollTop += speed * (delta / 16);
        scrollContainer.scrollTop = exactScrollTop;

        // If it hit the bottom, exactScrollTop might grow infinitely. 
        // Sync it to actual scrollTop to prevent it from running away.
        if (Math.abs(scrollContainer.scrollTop - exactScrollTop) > 2) {
          exactScrollTop = scrollContainer.scrollTop;
        }
      }
      lastTime = time;
    };

    animationFrameId = requestAnimationFrame(animateScroll);

    // Pause on hover
    const handleMouseEnter = () => { isHovering = true; };
    const handleMouseLeave = () => {
      isHovering = false;
      if (scrollContainer) {
        exactScrollTop = scrollContainer.scrollTop;
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mouseenter", handleMouseEnter);
      container.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (container) {
        container.removeEventListener("mouseenter", handleMouseEnter);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, [isLoading, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-gray-50 dark:bg-gray-900 rounded-xl">
        <Sparkles className="animate-pulse text-primary mb-4" size={32} />
        <p className="text-default-500 font-medium">{t("generatingInspiration")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px] bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden p-4 relative border border-default-200 dark:border-default-100">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Sparkles className="text-primary" size={20} />
        <h3 className="text-lg font-semibold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">
          {searchTerm}
        </h3>
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative -mx-4 px-4 overflow-hidden"
      >
        <VideoGrid hideSummary={true} />

        {/* Top/bottom gradient overlays to fade the scrolling content */}
        <div className="absolute top-0 left-0 right-0 h-8 bg-linear-to-b from-gray-50 dark:from-gray-900 to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-gray-50 dark:from-gray-900 to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
}
