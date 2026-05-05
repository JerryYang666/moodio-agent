"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import type { TimelineClip } from "./types";
import { getEffectiveDuration } from "./types";

export type DropSide = "before" | "after";

interface TimelineClipCardProps {
  clip: TimelineClip;
  index: number;
  variant: "video" | "audio";
  isActive?: boolean;
  isDragging?: boolean;
  onClick: (index: number) => void;
  onRemove?: (clipId: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number, side: DropSide) => void;
  onDragEnd: () => void;
  onTrimChange?: (clipId: string, trimStart: number, trimEnd: number) => void;
  onTrimScrub?: (time: number | null) => void;
  /** Fired synchronously on trim-handle mousedown, before any selection change. */
  onTrimDragStart?: () => void;
  /** Click seek. `sourceTime` is mapped from x-offset across the trimmed range. */
  onSeekInClip?: (index: number, sourceTime: number) => void;
}

const MIN_CLIP_DURATION = 0.5;
const HANDLE_WIDTH = 6;
const PX_PER_SECOND = 30;
const DEFAULT_LOADING_WIDTH = 120;

// Module-level flag to block onClick across all clip instances during/after trim drag
let _trimDragActive = false;

export default function TimelineClipCard({
  clip,
  index,
  variant,
  isActive,
  isDragging,
  onClick,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onTrimChange,
  onTrimScrub,
  onTrimDragStart,
  onSeekInClip,
}: TimelineClipCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [trimDrag, setTrimDrag] = useState<{
    side: "left" | "right";
    currentValue: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Close context menu on click-away or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleReorderDragStart = useCallback(
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
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const midX = rect.left + rect.width / 2;
      const side: DropSide = e.clientX < midX ? "before" : "after";
      onDragOver(index, side);
    },
    [index, onDragOver]
  );

  const handleTrimHandleMouseDown = useCallback(
    (side: "left" | "right", e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onTrimChange || clip.duration <= 0) return;

      // Must fire before onClick(index) below — otherwise the active-clip
      // switch happens first and the playhead jumps before the panel
      // can snapshot its pixel position.
      onTrimDragStart?.();

      _trimDragActive = true;
      onClick(index);

      const startX = e.clientX;
      const startTrimStart = clip.trimStart ?? 0;
      const startTrimEnd = clip.trimEnd ?? clip.duration;

      setTrimDrag({
        side,
        currentValue: side === "left" ? startTrimStart : startTrimEnd,
      });

      let latestScrubValue = side === "left" ? startTrimStart : startTrimEnd;
      onTrimScrub?.(latestScrubValue);
      let lastScrubTime = Date.now();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaTime = deltaX / PX_PER_SECOND;

        let newTrimStart = startTrimStart;
        let newTrimEnd = startTrimEnd;

        if (side === "left") {
          newTrimStart = Math.max(0, startTrimStart + deltaTime);
          newTrimStart = Math.min(newTrimStart, newTrimEnd - MIN_CLIP_DURATION);
          newTrimStart = Math.max(0, Math.round(newTrimStart * 10) / 10);
          setTrimDrag({ side, currentValue: newTrimStart });
          latestScrubValue = newTrimStart;
        } else {
          newTrimEnd = Math.min(clip.duration, startTrimEnd + deltaTime);
          newTrimEnd = Math.max(newTrimEnd, newTrimStart + MIN_CLIP_DURATION);
          newTrimEnd = Math.min(clip.duration, Math.round(newTrimEnd * 10) / 10);
          setTrimDrag({ side, currentValue: newTrimEnd });
          latestScrubValue = newTrimEnd;
        }

        onTrimChange(clip.id, newTrimStart, newTrimEnd);

        // Throttle scrub at ~60ms to avoid spamming the preview element.
        const now = Date.now();
        if (now - lastScrubTime >= 60) {
          lastScrubTime = now;
          onTrimScrub?.(latestScrubValue);
        }
      };

      const handleMouseUp = () => {
        onTrimScrub?.(latestScrubValue);
        // Clear next frame so the preview stays painted on the final frame.
        requestAnimationFrame(() => onTrimScrub?.(null));

        setTrimDrag(null);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);

        setTimeout(() => { _trimDragActive = false; }, 50);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [clip, onTrimChange, onTrimScrub, onTrimDragStart, onClick, index]
  );

  const handleHandleDoubleClick = useCallback(
    (side: "left" | "right", e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onTrimChange || clip.duration <= 0) return;
      const trimStart = clip.trimStart ?? 0;
      const trimEnd = clip.trimEnd ?? clip.duration;
      if (side === "left") {
        onTrimChange(clip.id, 0, trimEnd);
      } else {
        onTrimChange(clip.id, trimStart, clip.duration);
      }
    },
    [clip, onTrimChange]
  );

  const isVideo = variant === "video";
  const effectiveDuration = getEffectiveDuration(clip);
  const durationKnown = clip.duration > 0;
  const canTrim = isVideo && !!onTrimChange;

  // Strictly proportional to duration so the timeline reflects real length.
  // Falls back to DEFAULT_LOADING_WIDTH while the duration probe is in flight.
  const fullWidth = !durationKnown
    ? DEFAULT_LOADING_WIDTH
    : clip.duration * PX_PER_SECOND;
  const width = !durationKnown
    ? DEFAULT_LOADING_WIDTH
    : effectiveDuration * PX_PER_SECOND;

  // Crop thumbnail by trimStart; clamp so its right edge never crosses the card's.
  const trimStartRatio = durationKnown && clip.duration > 0 ? (clip.trimStart ?? 0) / clip.duration : 0;
  const thumbOffset = Math.max(-(fullWidth - width), -(trimStartRatio * fullWidth));

  return (
    <div className="flex flex-col items-start shrink-0">
      <div
        className="flex items-center gap-1 px-0.5 mb-0.5 min-w-0"
        style={{ maxWidth: width }}
      >
        <span className="text-[10px] text-default-400 truncate min-w-0">
          {clip.title || "Untitled"}
        </span>
      </div>

      {/* Clip card */}
      <div
        ref={cardRef}
        draggable
        onClick={(e) => {
          if (_trimDragActive) return;
          onClick(index);
          const rect = cardRef.current?.getBoundingClientRect();
          if (rect && onSeekInClip && clip.duration > 0 && rect.width > 0) {
            const progress = Math.max(
              0,
              Math.min(1, (e.clientX - rect.left) / rect.width)
            );
            const trimStart = clip.trimStart ?? 0;
            const trimEnd = clip.trimEnd ?? clip.duration;
            onSeekInClip(index, trimStart + progress * (trimEnd - trimStart));
          }
        }}
        onContextMenu={handleContextMenu}
        onDragStart={handleReorderDragStart}
        onDragOver={handleDragOver}
        onDragEnd={onDragEnd}
        className={`relative shrink-0 h-[64px] rounded-lg border overflow-visible cursor-pointer active:cursor-grabbing select-none group/clip ${
          isDragging ? "opacity-30" : ""
        } ${
          isActive
            ? "border-primary ring-1 ring-primary"
            : isVideo
              ? "border-primary/30 bg-primary/10 hover:border-primary/50"
              : "border-secondary/30 bg-secondary/10 hover:border-secondary/50"
        }`}
        style={{ width }}
      >
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          {isVideo && clip.thumbnailUrl ? (
            <img
              src={clip.thumbnailUrl}
              alt=""
              draggable={false}
              className={`h-full max-w-none object-cover ${durationKnown ? "opacity-80" : "opacity-40"}`}
              style={{ width: fullWidth, marginLeft: thumbOffset }}
            />
          ) : null}
        </div>

        {!durationKnown && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <Loader2 size={14} className="animate-spin text-default-400" />
          </div>
        )}

        {canTrim && (
          <div
            className="absolute left-0 top-0 bottom-0 z-20 cursor-col-resize group/handle-l flex items-center justify-center"
            style={{ width: HANDLE_WIDTH }}
            onMouseDown={(e) => handleTrimHandleMouseDown("left", e)}
            onDoubleClick={(e) => handleHandleDoubleClick("left", e)}
          >
            <div
              className={`w-[3px] h-[60%] rounded-full transition-all ${
                trimDrag?.side === "left"
                  ? "bg-primary shadow-[0_0_6px_1px_hsl(var(--heroui-primary)/0.6)]"
                  : "bg-default-400/50 group-hover/handle-l:bg-primary/80"
              }`}
            />
            {trimDrag?.side === "left" && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] px-1.5 py-0.5 rounded tabular-nums whitespace-nowrap shadow-md">
                {trimDrag.currentValue.toFixed(1)}s
              </div>
            )}
          </div>
        )}

        {canTrim && (
          <div
            className="absolute right-0 top-0 bottom-0 z-20 cursor-col-resize group/handle-r flex items-center justify-center"
            style={{ width: HANDLE_WIDTH }}
            onMouseDown={(e) => handleTrimHandleMouseDown("right", e)}
            onDoubleClick={(e) => handleHandleDoubleClick("right", e)}
          >
            <div
              className={`w-[3px] h-[60%] rounded-full transition-all ${
                trimDrag?.side === "right"
                  ? "bg-primary shadow-[0_0_6px_1px_hsl(var(--heroui-primary)/0.6)]"
                  : "bg-default-400/50 group-hover/handle-r:bg-primary/80"
              }`}
            />
            {trimDrag?.side === "right" && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] px-1.5 py-0.5 rounded tabular-nums whitespace-nowrap shadow-md">
                {trimDrag.currentValue.toFixed(1)}s
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portaled to body so the fixed menu escapes backdrop-blur stacking context. */}
      {contextMenu && onRemove && createPortal(
        <div
          className="fixed z-9999 bg-background border border-divider rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors text-left"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
              onRemove(clip.id);
            }}
          >
            <Trash2 size={12} />
            Delete clip
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
