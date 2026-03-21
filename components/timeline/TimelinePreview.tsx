"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import type { TimelineClip } from "./types";
import { getEffectiveDuration } from "./types";

interface TimelinePreviewProps {
  clips: TimelineClip[];
  activeClipIndex: number;
  onActiveClipChange: (index: number) => void;
  scrubTime?: number | null;
}

/**
 * Double-buffered video preview for gapless sequential playback.
 * Respects trimStart/trimEnd: seeks to trimStart on play, stops at trimEnd.
 */
export default function TimelinePreview({
  clips,
  activeClipIndex,
  onActiveClipChange,
  scrubTime,
}: TimelinePreviewProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  const [frontSlot, setFrontSlot] = useState<"A" | "B">("A");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const activeClip = clips[activeClipIndex] ?? null;
  const nextClip = clips[activeClipIndex + 1] ?? null;

  const frontRef = frontSlot === "A" ? videoARef : videoBRef;
  const backRef = frontSlot === "A" ? videoBRef : videoARef;

  const autoAdvancingRef = useRef(false);
  const scrubActiveRef = useRef(false);

  const getTrimStart = (clip: TimelineClip | null) => clip?.trimStart ?? 0;
  const getTrimEnd = (clip: TimelineClip | null) =>
    clip?.trimEnd ?? clip?.duration ?? 0;

  // ---- Scrub: pause and seek during trim drag ----
  useEffect(() => {
    if (scrubTime == null) {
      scrubActiveRef.current = false;
      return;
    }
    scrubActiveRef.current = true;
    const front = frontRef.current;
    if (!front) return;
    front.pause();
    front.currentTime = scrubTime;
    setCurrentTime(scrubTime);
    setIsPlaying(false);
  }, [scrubTime, frontRef]);

  // ---- Keep the back buffer preloaded with the next clip ----
  useEffect(() => {
    const back = backRef.current;
    if (!back) return;
    const nextUrl = nextClip?.videoUrl ?? "";
    if (back.src !== nextUrl) {
      back.src = nextUrl;
      if (nextUrl) back.load();
    }
  }, [nextClip?.videoUrl, backRef]);

  // ---- When activeClipIndex changes externally (skip / click) or via auto-advance, reset ----
  const prevIndexRef = useRef(activeClipIndex);
  useEffect(() => {
    if (prevIndexRef.current === activeClipIndex) return;
    const wasAutoAdvancing = autoAdvancingRef.current;
    prevIndexRef.current = activeClipIndex;
    autoAdvancingRef.current = false;

    const front = frontRef.current;
    if (!front) return;

    front.pause();

    const url = activeClip?.videoUrl ?? "";
    if (front.src !== url) {
      front.src = url;
      if (url) front.load();
    }
    const startTime = getTrimStart(activeClip);
    front.currentTime = startTime;
    setCurrentTime(startTime);

    if (wasAutoAdvancing && url) {
      // Auto-play the next clip
      front.play().catch(() => {});
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [activeClipIndex, activeClip?.videoUrl, frontRef, activeClip]);

  // ---- Stop at trimEnd during playback ----
  const handleTimeUpdate = useCallback(() => {
    const front = frontRef.current;
    if (!front) return;
    setCurrentTime(front.currentTime);

    // Skip auto-advance when paused (during scrub/trim drag or user pause)
    if (front.paused || scrubActiveRef.current) return;

    const endTime = getTrimEnd(activeClip);
    if (endTime > 0 && front.currentTime >= endTime - 0.05) {
      front.pause();
      if (activeClipIndex < clips.length - 1) {
        const back = backRef.current;
        if (back) {
          const nextStart = getTrimStart(nextClip);
          back.currentTime = nextStart;
          back.play().catch(() => {});
        }
        autoAdvancingRef.current = true;
        setFrontSlot((prev) => (prev === "A" ? "B" : "A"));
        // Keep isPlaying true since the next clip continues playing
        setIsPlaying(true);
        onActiveClipChange(activeClipIndex + 1);
      } else {
        setIsPlaying(false);
      }
    }
  }, [frontRef, activeClip, activeClipIndex, clips.length, backRef, nextClip, onActiveClipChange]);

  // ---- Gapless advance: swap buffers on ended (fallback if trimEnd isn't set) ----
  const handleVideoEnded = useCallback(() => {
    // Guard: if auto-advance already happened from handleTimeUpdate, skip
    if (autoAdvancingRef.current) return;

    if (activeClipIndex >= clips.length - 1) {
      setIsPlaying(false);
      return;
    }

    const back = backRef.current;
    if (back) {
      const nextStart = getTrimStart(nextClip);
      back.currentTime = nextStart;
      back.play().catch(() => {});
    }

    autoAdvancingRef.current = true;
    setFrontSlot((prev) => (prev === "A" ? "B" : "A"));
    setIsPlaying(true);
    onActiveClipChange(activeClipIndex + 1);
  }, [activeClipIndex, clips.length, onActiveClipChange, backRef, nextClip]);

  const handleTogglePlay = useCallback(() => {
    const front = frontRef.current;
    if (!front || !activeClip?.videoUrl) return;
    if (isPlaying) {
      front.pause();
    } else {
      const startTime = getTrimStart(activeClip);
      const endTime = getTrimEnd(activeClip);
      if (front.currentTime < startTime || front.currentTime >= endTime) {
        front.currentTime = startTime;
      }
      front.play().catch(() => {});
    }
  }, [isPlaying, activeClip, frontRef]);

  const handlePrev = useCallback(() => {
    if (activeClipIndex <= 0) return;
    frontRef.current?.pause();
    setIsPlaying(false);
    onActiveClipChange(activeClipIndex - 1);
  }, [activeClipIndex, onActiveClipChange, frontRef]);

  const handleNext = useCallback(() => {
    if (activeClipIndex >= clips.length - 1) return;
    frontRef.current?.pause();
    setIsPlaying(false);
    onActiveClipChange(activeClipIndex + 1);
  }, [activeClipIndex, clips.length, onActiveClipChange, frontRef]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-default-300">
        <span className="text-xs">No clips in timeline</span>
      </div>
    );
  }

  const effectiveDur = activeClip ? getEffectiveDuration(activeClip) : 0;
  const trimStart = getTrimStart(activeClip);
  const relativeTime = Math.max(0, currentTime - trimStart);

  return (
    <div className="flex flex-col h-full">
      {/* Video display — two overlapping <video> elements */}
      <div className="flex-1 bg-black rounded-lg overflow-hidden relative min-h-0">
        <video
          ref={videoARef}
          src={frontSlot === "A" ? (activeClip?.videoUrl ?? "") : (nextClip?.videoUrl ?? "")}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-75 ${
            frontSlot === "A" ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
          onEnded={frontSlot === "A" ? handleVideoEnded : undefined}
          onTimeUpdate={frontSlot === "A" ? handleTimeUpdate : undefined}
          onPlay={frontSlot === "A" ? () => setIsPlaying(true) : undefined}
          onPause={frontSlot === "A" ? () => setIsPlaying(false) : undefined}
          playsInline
        />
        <video
          ref={videoBRef}
          src={frontSlot === "B" ? (activeClip?.videoUrl ?? "") : (nextClip?.videoUrl ?? "")}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-75 ${
            frontSlot === "B" ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
          onEnded={frontSlot === "B" ? handleVideoEnded : undefined}
          onTimeUpdate={frontSlot === "B" ? handleTimeUpdate : undefined}
          onPlay={frontSlot === "B" ? () => setIsPlaying(true) : undefined}
          onPause={frontSlot === "B" ? () => setIsPlaying(false) : undefined}
          playsInline
        />

        {/* Fallback when no video URL */}
        {!activeClip?.videoUrl && activeClip?.thumbnailUrl && (
          <img
            src={activeClip.thumbnailUrl}
            alt={activeClip.title}
            className="absolute inset-0 w-full h-full object-contain z-20"
          />
        )}
        {!activeClip?.videoUrl && !activeClip?.thumbnailUrl && (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center text-default-400 text-xs z-20">
            No preview available
          </div>
        )}
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-3 py-2">
        <button
          onClick={handlePrev}
          disabled={activeClipIndex <= 0}
          className="p-1 rounded hover:bg-default-100 text-default-500 disabled:text-default-200 transition-colors"
        >
          <SkipBack size={14} />
        </button>

        <button
          onClick={handleTogglePlay}
          disabled={!activeClip?.videoUrl}
          className="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/80 disabled:bg-default-200 disabled:text-default-400 transition-colors"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <button
          onClick={handleNext}
          disabled={activeClipIndex >= clips.length - 1}
          className="p-1 rounded hover:bg-default-100 text-default-500 disabled:text-default-200 transition-colors"
        >
          <SkipForward size={14} />
        </button>

        <span className="text-[10px] text-default-400 ml-2 tabular-nums">
          {formatTime(relativeTime)}
          {effectiveDur > 0 ? ` / ${formatTime(effectiveDur)}` : ""}
        </span>
      </div>
    </div>
  );
}
