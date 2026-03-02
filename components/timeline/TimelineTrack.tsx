"use client";

import { useState, useCallback, useRef } from "react";
import type { TimelineClip } from "./types";
import TimelineClipCard, { type DropSide } from "./TimelineClipCard";

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
  const [dropTarget, setDropTarget] = useState<{
    index: number;
    side: DropSide;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (index: number, side: DropSide) => {
      if (dragIndex === null) return;
      // Skip indicators that represent no actual move
      const insertionIndex = side === "before" ? index : index + 1;
      if (insertionIndex === dragIndex || insertionIndex === dragIndex + 1) {
        setDropTarget(null);
        return;
      }
      setDropTarget({ index, side });
    },
    [dragIndex]
  );

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dropTarget !== null) {
      const toIndex =
        dropTarget.side === "before" ? dropTarget.index : dropTarget.index + 1;
      // Adjust for the removal of the dragged item
      const adjusted = toIndex > dragIndex ? toIndex - 1 : toIndex;
      if (adjusted !== dragIndex) {
        onReorder(dragIndex, adjusted);
      }
    }
    setDragIndex(null);
    setDropTarget(null);
  }, [dragIndex, dropTarget, onReorder]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when leaving the track container itself
    if (!scrollRef.current?.contains(e.relatedTarget as Node)) {
      setDropTarget(null);
    }
  }, []);

  const isVideo = variant === "video";

  // Convert dropTarget {index, side} into a slot position (0 = before first, 1 = between first & second, etc.)
  const dropSlot =
    dragIndex !== null && dropTarget
      ? dropTarget.side === "before"
        ? dropTarget.index
        : dropTarget.index + 1
      : null;

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
        className="flex-1 flex items-center px-2 py-1 overflow-x-auto min-w-0"
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
      >
        {clips.length === 0 ? (
          <div className="flex items-center justify-center h-full w-full">
            <span className="text-[10px] text-default-300 italic">
              {isVideo ? "Drag videos here or right-click an asset" : "Audio appears automatically"}
            </span>
          </div>
        ) : (
          clips.map((clip, i) => (
            <div key={clip.id} className="flex items-center shrink-0 h-full">
              {/* Drop indicator before this clip */}
              <div
                className={`flex items-center justify-center shrink-0 transition-all duration-200 ease-out h-full ${
                  dropSlot === i ? "w-[14px] mx-[2px]" : "w-[4px]"
                }`}
              >
                {dropSlot === i && (
                  <div className="w-[4px] h-[80%] bg-primary rounded-full shadow-[0_0_8px_2px_hsl(var(--heroui-primary)/0.5)]" />
                )}
              </div>
              <TimelineClipCard
                clip={clip}
                index={i}
                variant={variant}
                isActive={clip.id === activeClipId}
                isDragging={dragIndex === i}
                onRemove={onRemoveClip}
                onClick={onClipClick}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              />
              {/* Drop indicator after the last clip */}
              {i === clips.length - 1 && (
                <div
                  className={`flex items-center justify-center shrink-0 transition-all duration-200 ease-out h-full ${
                    dropSlot === clips.length ? "w-[14px] mx-[2px]" : "w-[4px]"
                  }`}
                >
                  {dropSlot === clips.length && (
                    <div className="w-[4px] h-[80%] bg-primary rounded-full shadow-[0_0_8px_2px_hsl(var(--heroui-primary)/0.5)]" />
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
