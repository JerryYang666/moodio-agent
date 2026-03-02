"use client";

import { useState, useCallback, useRef } from "react";
import type { TimelineClip } from "./types";
import TimelineClipCard from "./TimelineClipCard";

interface TimelineTrackProps {
  label: string;
  variant: "video" | "audio";
  clips: TimelineClip[];
  activeClipId: string | null;
  onRemoveClip: (clipId: string) => void;
  onClipClick: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export default function TimelineTrack({
  label,
  variant,
  clips,
  activeClipId,
  onRemoveClip,
  onClipClick,
  onReorder,
}: TimelineTrackProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    setDropIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      onReorder(dragIndex, dropIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex, dropIndex, onReorder]);

  const isVideo = variant === "video";

  return (
    <div className="flex items-stretch gap-0 h-[52px]">
      {/* Track label */}
      <div
        className={`w-[80px] shrink-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider border-r border-divider ${
          isVideo
            ? "text-primary bg-primary/5"
            : "text-secondary bg-secondary/5"
        }`}
      >
        {label}
      </div>

      {/* Clips area */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center gap-1 px-2 py-1 overflow-x-auto min-w-0"
        onDragOver={(e) => e.preventDefault()}
      >
        {clips.length === 0 ? (
          <div className="flex items-center justify-center h-full w-full">
            <span className="text-[10px] text-default-300 italic">
              {isVideo ? "Drag videos here or right-click an asset" : "Audio appears automatically"}
            </span>
          </div>
        ) : (
          clips.map((clip, i) => (
            <TimelineClipCard
              key={clip.id}
              clip={clip}
              index={i}
              variant={variant}
              isActive={clip.id === activeClipId}
              onRemove={onRemoveClip}
              onClick={onClipClick}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}
