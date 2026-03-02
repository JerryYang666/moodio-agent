"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Film,
} from "lucide-react";
import type { TimelineClip } from "./types";
import TimelineTrack from "./TimelineTrack";
import TimelinePreview from "./TimelinePreview";

interface TimelinePanelProps {
  clips: TimelineClip[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onRemoveClip: (clipId: string) => void;
  onReorderClips: (fromIndex: number, toIndex: number) => void;
  onClearTimeline: () => void;
}

const PANEL_HEIGHT = 260;

export default function TimelinePanel({
  clips,
  isExpanded,
  onToggleExpanded,
  onRemoveClip,
  onReorderClips,
  onClearTimeline,
}: TimelinePanelProps) {
  const [activeClipIndex, setActiveClipIndex] = useState(0);

  // Keep active index in bounds
  useEffect(() => {
    if (activeClipIndex >= clips.length) {
      setActiveClipIndex(Math.max(0, clips.length - 1));
    }
  }, [clips.length, activeClipIndex]);

  // Listen for "send-to-timeline" custom events to auto-expand
  useEffect(() => {
    const handleSendToTimeline = () => {
      if (!isExpanded) onToggleExpanded();
    };
    window.addEventListener("timeline-clip-added", handleSendToTimeline);
    return () =>
      window.removeEventListener("timeline-clip-added", handleSendToTimeline);
  }, [isExpanded, onToggleExpanded]);

  const activeClipId = clips[activeClipIndex]?.id ?? null;

  const handleActiveClipChange = useCallback((index: number) => {
    setActiveClipIndex(index);
  }, []);

  return (
    <div className="flex flex-col border-t border-divider bg-background/95 backdrop-blur-sm select-none">
      {/* Collapsed bar — always visible */}
      <button
        onClick={onToggleExpanded}
        className="flex items-center justify-between px-4 py-1.5 hover:bg-default-50 transition-colors cursor-pointer shrink-0"
      >
        <div className="flex items-center gap-2">
          <Film size={14} className="text-primary" />
          <span className="text-xs font-semibold text-default-700">
            Timeline
          </span>
          {clips.length > 0 && (
            <span className="text-[10px] text-default-400 bg-default-100 rounded-full px-1.5 py-0.5">
              {clips.length} clip{clips.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {clips.length > 0 && isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearTimeline();
              }}
              className="p-1 rounded hover:bg-danger/10 text-default-400 hover:text-danger transition-colors"
              title="Clear timeline"
            >
              <Trash2 size={12} />
            </button>
          )}
          {isExpanded ? (
            <ChevronDown size={14} className="text-default-400" />
          ) : (
            <ChevronUp size={14} className="text-default-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          className="flex border-t border-divider"
          style={{ height: PANEL_HEIGHT }}
        >
          {/* Preview — left side */}
          <div className="w-[240px] shrink-0 border-r border-divider p-2">
            <TimelinePreview
              clips={clips}
              activeClipIndex={activeClipIndex}
              onActiveClipChange={handleActiveClipChange}
            />
          </div>

          {/* Tracks — right side */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Ruler / time indicator */}
            <div className="flex items-center h-[24px] border-b border-divider bg-default-50/50 shrink-0">
              <div className="w-[80px] shrink-0" />
              <div className="flex-1 flex items-center px-2">
                <TimeRuler clips={clips} />
              </div>
            </div>

            {/* Video track */}
            <div className="border-b border-divider">
              <TimelineTrack
                label="Video"
                variant="video"
                clips={clips}
                activeClipId={activeClipId}
                onRemoveClip={onRemoveClip}
                onClipClick={handleActiveClipChange}
                onReorder={onReorderClips}
              />
            </div>

            {/* Audio track */}
            <div className="border-b border-divider">
              <TimelineTrack
                label="Audio"
                variant="audio"
                clips={clips}
                activeClipId={activeClipId}
                onRemoveClip={onRemoveClip}
                onClipClick={handleActiveClipChange}
                onReorder={onReorderClips}
              />
            </div>

            {/* Bottom spacer */}
            <div className="flex-1 bg-default-50/30" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Simple time ruler showing cumulative timestamps */
function TimeRuler({ clips }: { clips: TimelineClip[] }) {
  if (clips.length === 0) {
    return (
      <span className="text-[9px] text-default-300">00:00</span>
    );
  }

  const pxPerSecond = 30;
  const minClipWidth = 120;
  let cumulative = 0;
  const markers: { position: number; label: string }[] = [
    { position: 0, label: "0:00" },
  ];

  for (const clip of clips) {
    const dur = clip.duration || 4;
    cumulative += dur;
    const width = Math.max(minClipWidth, dur * pxPerSecond);
    markers.push({
      position: markers[markers.length - 1].position + width + 4, // 4 = gap
      label: formatRulerTime(cumulative),
    });
  }

  return (
    <div className="relative h-full w-full">
      {markers.map((m, i) => (
        <span
          key={i}
          className="absolute top-1/2 -translate-y-1/2 text-[9px] text-default-400 tabular-nums"
          style={{ left: m.position }}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}

function formatRulerTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
