"use client";

import { useCallback, useRef } from "react";
import type { TimelineClip } from "./types";
import { getEffectiveDuration } from "./types";
import {
  DEFAULT_LOADING_WIDTH,
  PX_PER_SECOND,
} from "@/lib/timeline/playhead";
import TimelineClipCard, { type DropSide } from "./TimelineClipCard";

interface TimelineTrackProps {
  label: string;
  variant: "video" | "audio";
  clips: TimelineClip[];
  activeClipId: string | null;
  onClipClick: (index: number) => void;
  onRemoveClip?: (clipId: string) => void;
  onTrimChange?: (clipId: string, trimStart: number, trimEnd: number) => void;
  onTrimScrub?: (time: number | null) => void;
  /** Fired on trim-handle mousedown (before selection changes) so the panel can freeze the playhead. */
  onTrimDragStart?: () => void;
  /** Seek within a clip when the user clicks on it (x-offset -> source-video time). */
  onSeekInClip?: (index: number, sourceTime: number) => void;
  /** Which clip index is currently being dragged (null = none) */
  dragIndex: number | null;
  /** Computed insertion-point index for the drop indicator (null = none) */
  dropSlot: number | null;
  /** Fired when a clip starts being dragged */
  onDragStart: (index: number) => void;
  /** Fired continuously during drag with the hovered clip index + side */
  onDragOver: (index: number, side: DropSide) => void;
  /** Fired when the drag ends (drop or cancel) */
  onDragEnd: () => void;
}

export default function TimelineTrack({
  label,
  variant,
  clips,
  activeClipId,
  onClipClick,
  onRemoveClip,
  onTrimChange,
  onTrimScrub,
  onTrimDragStart,
  onSeekInClip,
  dragIndex,
  dropSlot,
  onDragStart,
  onDragOver,
  onDragEnd,
}: TimelineTrackProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!scrollRef.current?.contains(e.relatedTarget as Node)) {
      // Don't clear drop target here — let the panel handle it
    }
  }, []);

  const isVideo = variant === "video";

  return (
    <div className="flex items-stretch gap-0 min-h-[96px]">
      <div
        className={`w-[80px] shrink-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider border-r border-divider ${
          isVideo
            ? "text-primary bg-primary/5"
            : "text-secondary bg-secondary/5"
        }`}
      >
        {label}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 flex items-end px-2 py-1 min-w-0"
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
      >
        {clips.length === 0 ? (
          <div className="flex items-center justify-center h-[80px] w-full">
            <span className="text-[10px] text-default-300 italic">
              {isVideo ? "Drag videos here or right-click an asset" : "Audio appears automatically"}
            </span>
          </div>
        ) : (
          clips.map((clip, i) => {
            // Silent clips become invisible width-matched spacers so
            // the remaining audio cards stay aligned with the video track.
            const isAudioSpacer =
              !isVideo && clip.hasAudio === false;
            const durationKnown = clip.duration > 0;
            const spacerWidth = !durationKnown
              ? DEFAULT_LOADING_WIDTH
              : getEffectiveDuration(clip) * PX_PER_SECOND;

            return (
              <div key={clip.id} className="flex items-end shrink-0">
                <div
                  className={`flex items-center justify-center shrink-0 transition-all duration-200 ease-out min-h-[64px] ${
                    dropSlot === i ? "w-[14px] mx-[2px]" : "w-[4px]"
                  }`}
                >
                  {dropSlot === i && (
                    <div className="w-[4px] h-[52px] bg-primary rounded-full shadow-[0_0_8px_2px_hsl(var(--heroui-primary)/0.5)]" />
                  )}
                </div>
                {isAudioSpacer ? (
                  <div
                    className="shrink-0 h-[64px]"
                    style={{ width: spacerWidth }}
                    aria-hidden="true"
                  />
                ) : (
                  <TimelineClipCard
                    clip={clip}
                    index={i}
                    variant={variant}
                    isActive={clip.id === activeClipId}
                    isDragging={dragIndex === i}
                    onClick={onClipClick}
                    onRemove={onRemoveClip}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragEnd={onDragEnd}
                    onTrimChange={onTrimChange}
                    onTrimScrub={onTrimScrub}
                    onTrimDragStart={onTrimDragStart}
                    onSeekInClip={onSeekInClip}
                  />
                )}
                {i === clips.length - 1 && (
                  <div
                    className={`flex items-center justify-center shrink-0 transition-all duration-200 ease-out min-h-[64px] ${
                      dropSlot === clips.length ? "w-[14px] mx-[2px]" : "w-[4px]"
                    }`}
                  >
                    {dropSlot === clips.length && (
                      <div className="w-[4px] h-[52px] bg-primary rounded-full shadow-[0_0_8px_2px_hsl(var(--heroui-primary)/0.5)]" />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
