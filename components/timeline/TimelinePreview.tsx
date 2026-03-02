"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import type { TimelineClip } from "./types";

interface TimelinePreviewProps {
  clips: TimelineClip[];
  activeClipIndex: number;
  onActiveClipChange: (index: number) => void;
}

/**
 * Double-buffered video preview for gapless sequential playback.
 *
 * Two <video> elements alternate roles:
 *   - "front"  → visible, currently playing
 *   - "back"   → hidden, preloading the next clip
 *
 * When the front video ends we instantly swap: the back becomes front
 * (already loaded & ready to play) and the old front begins preloading
 * the clip after that.
 */
export default function TimelinePreview({
  clips,
  activeClipIndex,
  onActiveClipChange,
}: TimelinePreviewProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  // Which ref is currently the "front" (visible) player
  const [frontSlot, setFrontSlot] = useState<"A" | "B">("A");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const activeClip = clips[activeClipIndex] ?? null;
  const nextClip = clips[activeClipIndex + 1] ?? null;

  const frontRef = frontSlot === "A" ? videoARef : videoBRef;
  const backRef = frontSlot === "A" ? videoBRef : videoARef;

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

  // ---- When activeClipIndex changes externally (skip / click), reset ----
  const prevIndexRef = useRef(activeClipIndex);
  useEffect(() => {
    if (prevIndexRef.current === activeClipIndex) return;
    prevIndexRef.current = activeClipIndex;

    const front = frontRef.current;
    if (!front) return;

    const url = activeClip?.videoUrl ?? "";
    if (front.src !== url) {
      front.src = url;
      if (url) front.load();
    }
    front.currentTime = 0;
    setCurrentTime(0);
  }, [activeClipIndex, activeClip?.videoUrl, frontRef]);

  // ---- Gapless advance: swap buffers on ended ----
  const handleVideoEnded = useCallback(() => {
    if (activeClipIndex >= clips.length - 1) {
      setIsPlaying(false);
      return;
    }

    // The back buffer already has the next clip loaded — swap it to front
    const back = backRef.current;
    if (back) {
      back.currentTime = 0;
      back.play().catch(() => {});
    }

    setFrontSlot((prev) => (prev === "A" ? "B" : "A"));
    onActiveClipChange(activeClipIndex + 1);
  }, [activeClipIndex, clips.length, onActiveClipChange, backRef]);

  const handleTimeUpdate = useCallback(() => {
    const front = frontRef.current;
    if (front) setCurrentTime(front.currentTime);
  }, [frontRef]);

  // ---- Transport controls ----
  const handleTogglePlay = useCallback(() => {
    const front = frontRef.current;
    if (!front || !activeClip?.videoUrl) return;
    if (isPlaying) {
      front.pause();
    } else {
      front.play().catch(() => {});
    }
  }, [isPlaying, activeClip?.videoUrl, frontRef]);

  const handlePrev = useCallback(() => {
    if (activeClipIndex > 0) {
      onActiveClipChange(activeClipIndex - 1);
    }
  }, [activeClipIndex, onActiveClipChange]);

  const handleNext = useCallback(() => {
    if (activeClipIndex < clips.length - 1) {
      onActiveClipChange(activeClipIndex + 1);
    }
  }, [activeClipIndex, clips.length, onActiveClipChange]);

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

  // Shared props for both video elements
  const sharedVideoProps = {
    playsInline: true,
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
  } as const;

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
          {...sharedVideoProps}
        />
        <video
          ref={videoBRef}
          src={frontSlot === "B" ? (activeClip?.videoUrl ?? "") : (nextClip?.videoUrl ?? "")}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-75 ${
            frontSlot === "B" ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
          onEnded={frontSlot === "B" ? handleVideoEnded : undefined}
          onTimeUpdate={frontSlot === "B" ? handleTimeUpdate : undefined}
          {...sharedVideoProps}
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

        {/* Clip title overlay */}
        {activeClip && (
          <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded z-30">
            {activeClipIndex + 1}/{clips.length} - {activeClip.title || "Untitled"}
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
          {formatTime(currentTime)}
          {activeClip?.duration ? ` / ${formatTime(activeClip.duration)}` : ""}
        </span>
      </div>
    </div>
  );
}
