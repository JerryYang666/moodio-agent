"use client";

import { useCallback } from "react";
import { GripVertical, X, Film, Music } from "lucide-react";
import type { TimelineClip } from "./types";

interface TimelineClipCardProps {
  clip: TimelineClip;
  index: number;
  variant: "video" | "audio";
  isActive?: boolean;
  onRemove: (clipId: string) => void;
  onClick: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
}

/** Formats seconds into m:ss */
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TimelineClipCard({
  clip,
  index,
  variant,
  isActive,
  onRemove,
  onClick,
  onDragStart,
  onDragOver,
  onDragEnd,
}: TimelineClipCardProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      onDragStart(index);
    },
    [index, onDragStart]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onDragOver(index);
    },
    [index, onDragOver]
  );

  const isVideo = variant === "video";
  const Icon = isVideo ? Film : Music;

  // Width proportional to duration, with a minimum width
  const minWidth = 120;
  const pxPerSecond = 30;
  const width = Math.max(minWidth, (clip.duration || 4) * pxPerSecond);

  return (
    <div
      draggable
      onClick={() => onClick(index)}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      className={`relative shrink-0 h-full rounded-lg border overflow-hidden cursor-pointer active:cursor-grabbing select-none group/clip transition-all ${
        isActive
          ? "border-primary ring-1 ring-primary"
          : isVideo
            ? "border-primary/30 bg-primary/10 hover:border-primary/50"
            : "border-secondary/30 bg-secondary/10 hover:border-secondary/50"
      }`}
      style={{ width }}
    >
      {/* Thumbnail / visual */}
      <div className="absolute inset-0 flex items-center">
        {isVideo && clip.thumbnailUrl ? (
          <img
            src={clip.thumbnailUrl}
            alt=""
            draggable={false}
            className="w-full h-full object-cover opacity-40"
          />
        ) : null}
      </div>

      {/* Content overlay */}
      <div className="relative z-10 flex items-center gap-1.5 h-full px-2">
        <GripVertical
          size={12}
          className="text-default-400 shrink-0 opacity-0 group-hover/clip:opacity-100 transition-opacity"
        />
        <Icon
          size={12}
          className={`shrink-0 ${isVideo ? "text-primary" : "text-secondary"}`}
        />
        <span className="text-[10px] font-medium truncate text-default-700 flex-1">
          {clip.title || "Untitled"}
        </span>
        <span className="text-[9px] text-default-400 shrink-0">
          {formatDuration(clip.duration)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(clip.id);
          }}
          className="ml-0.5 p-0.5 rounded hover:bg-danger/20 text-default-400 hover:text-danger opacity-0 group-hover/clip:opacity-100 transition-all shrink-0"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
}
