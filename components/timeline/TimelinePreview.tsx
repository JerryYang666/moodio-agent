"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import type { TimelineClip } from "./types";

interface TimelinePreviewProps {
  clips: TimelineClip[];
  activeClipIndex: number;
  onActiveClipChange: (index: number) => void;
}

export default function TimelinePreview({
  clips,
  activeClipIndex,
  onActiveClipChange,
}: TimelinePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const activeClip = clips[activeClipIndex] ?? null;

  // When active clip changes, reset playback position
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, [activeClipIndex]);

  const handlePlay = useCallback(() => {
    if (!activeClip?.videoUrl) return;
    videoRef.current?.play();
    setIsPlaying(true);
  }, [activeClip]);

  const handlePause = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying, handlePlay, handlePause]);

  const handleVideoEnded = useCallback(() => {
    // Auto-advance to next clip for sequential playback
    if (activeClipIndex < clips.length - 1) {
      onActiveClipChange(activeClipIndex + 1);
      // Will auto-play when src changes
      setTimeout(() => {
        videoRef.current?.play();
      }, 100);
    } else {
      // End of timeline
      setIsPlaying(false);
    }
  }, [activeClipIndex, clips.length, onActiveClipChange]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

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

  return (
    <div className="flex flex-col h-full">
      {/* Video display */}
      <div className="flex-1 bg-black rounded-lg overflow-hidden relative min-h-0">
        {activeClip?.videoUrl ? (
          <video
            ref={videoRef}
            src={activeClip.videoUrl}
            className="w-full h-full object-contain"
            onEnded={handleVideoEnded}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            playsInline
          />
        ) : activeClip?.thumbnailUrl ? (
          <img
            src={activeClip.thumbnailUrl}
            alt={activeClip.title}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-default-400 text-xs">
            No preview available
          </div>
        )}

        {/* Clip title overlay */}
        {activeClip && (
          <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">
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
