"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Film,
  Clock,
  Download,
  Loader2,
  Check,
  X,
} from "lucide-react";
import type { TimelineClip } from "./types";
import { getTimelineStorageKey, getEffectiveDuration } from "./types";
import TimelineTrack from "./TimelineTrack";
import { type DropSide } from "./TimelineClipCard";
import TimelinePreview from "./TimelinePreview";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/dropdown";
import {
  buildRenderRequest,
  SUPPORTED_OUTPUT_FORMATS,
  type OutputFormat,
} from "@/lib/timeline/export";

interface TimelinePanelProps {
  clips: TimelineClip[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onRemoveClip: (clipId: string) => void;
  onReorderClips: (fromIndex: number, toIndex: number) => void;
  onClearTimeline: () => void;
  onUpdateClip?: (
    clipId: string,
    updates: Partial<Omit<TimelineClip, "id">>
  ) => void;
  desktopId?: string;
}

const PANEL_HEIGHT = 260;

type ExportState =
  | { status: "idle" }
  | { status: "exporting" }
  | { status: "success"; downloadUrl: string }
  | { status: "error"; message: string };

export default function TimelinePanel({
  clips,
  isExpanded,
  onToggleExpanded,
  onRemoveClip,
  onReorderClips,
  onClearTimeline,
  onUpdateClip,
  desktopId,
}: TimelinePanelProps) {
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [exportState, setExportState] = useState<ExportState>({
    status: "idle",
  });

  // Clamp activeClipIndex synchronously during render to avoid stale index after deletion
  const safeActiveClipIndex = clips.length === 0 ? 0 : Math.min(activeClipIndex, clips.length - 1);

  useEffect(() => {
    const handleSendToTimeline = () => {
      if (!isExpanded) onToggleExpanded();
    };
    window.addEventListener("timeline-clip-added", handleSendToTimeline);
    return () =>
      window.removeEventListener("timeline-clip-added", handleSendToTimeline);
  }, [isExpanded, onToggleExpanded]);

  const activeClipId = clips[safeActiveClipIndex]?.id ?? null;

  // Keyboard shortcut: Backspace/Delete removes the active clip
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      // Don't hijack input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (activeClipId) {
        e.preventDefault();
        onRemoveClip(activeClipId);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, activeClipId, onRemoveClip]);

  const handleActiveClipChange = useCallback((index: number) => {
    setActiveClipIndex(index);
  }, []);

  const handleTrimChange = useCallback(
    (clipId: string, trimStart: number, trimEnd: number) => {
      onUpdateClip?.(clipId, { trimStart, trimEnd });
    },
    [onUpdateClip]
  );

  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const handleTrimScrub = useCallback((time: number | null) => {
    setScrubTime(time);
  }, []);

  // ---- Shared drag state for both tracks ----
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; side: DropSide } | null>(null);

  const dropSlot =
    dragIndex !== null && dropTarget
      ? dropTarget.side === "before"
        ? dropTarget.index
        : dropTarget.index + 1
      : null;

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (index: number, side: DropSide) => {
      if (dragIndex === null) return;
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
      const adjusted = toIndex > dragIndex ? toIndex - 1 : toIndex;
      if (adjusted !== dragIndex) {
        onReorderClips(dragIndex, adjusted);
        setActiveClipIndex(adjusted);
      }
    }
    setDragIndex(null);
    setDropTarget(null);
  }, [dragIndex, dropTarget, onReorderClips]);

  const totalDuration = useMemo(
    () => clips.reduce((sum, clip) => sum + getEffectiveDuration(clip), 0),
    [clips]
  );

  const handleExport = useCallback(async (format: OutputFormat) => {
    if (!desktopId || clips.length === 0) return;
    setExportState({ status: "exporting" });
    try {
      const payload = buildRenderRequest(clips, desktopId, {
        outputFormat: format,
      });
      const res = await fetch("/api/render/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setExportState({ status: "success", downloadUrl: data.downloadUrl });
      } else {
        setExportState({
          status: "error",
          message: data.error || "Export failed",
        });
      }
    } catch (err) {
      setExportState({
        status: "error",
        message: err instanceof Error ? err.message : "Export failed",
      });
    }
  }, [clips, desktopId]);

  // Dev-mode: expose buildRenderRequest on window for console testing
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !desktopId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__buildRenderRequest = (format?: OutputFormat) => {
      const key = getTimelineStorageKey(desktopId);
      const raw = localStorage.getItem(key);
      if (!raw) return { error: `No timeline data at key: ${key}` };
      const timeline = JSON.parse(raw);
      return buildRenderRequest(timeline.clips, timeline.desktopId, {
        outputFormat: format ?? "mp4",
      });
    };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__buildRenderRequest;
    };
  }, [desktopId]);

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
          {clips.length > 0 && totalDuration > 0 && (
            <span className="text-[10px] text-default-400 bg-default-100 rounded-full px-1.5 py-0.5 flex items-center gap-1">
              <Clock size={9} />
              {formatRulerTime(totalDuration)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Export button area */}
          {clips.length > 0 && isExpanded && (
            <div className="flex items-center gap-1.5">
              {exportState.status === "idle" && (
                <Dropdown classNames={{ content: "min-w-0 w-fit" }}>
                  <DropdownTrigger>
                    <button
                      className="flex items-center gap-1 px-1.5 py-1 rounded text-xs hover:bg-primary/10 text-default-400 hover:text-primary transition-colors"
                      title="Export video"
                    >
                      <Download size={12} />
                      Export
                    </button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="Export format"
                    variant="flat"
                    className="min-w-0 w-fit"
                    onAction={(key) => handleExport(key as OutputFormat)}
                  >
                    <DropdownSection title="Export as">
                      {SUPPORTED_OUTPUT_FORMATS.map((f) => (
                        <DropdownItem key={f} startContent={<Film size={14} />}>
                          {f.toUpperCase()}
                        </DropdownItem>
                      ))}
                    </DropdownSection>
                  </DropdownMenu>
                </Dropdown>
              )}
              {exportState.status === "exporting" && (
                <div
                  className="flex items-center gap-1.5 px-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Loader2
                    size={12}
                    className="text-primary animate-spin"
                  />
                  <span className="text-[10px] text-default-400">
                    Exporting...
                  </span>
                </div>
              )}
              {exportState.status === "success" && (
                <div
                  className="flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Check size={12} className="text-success" />
                  <a
                    href={exportState.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:underline"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => setExportState({ status: "idle" })}
                    className="p-0.5 text-default-300 hover:text-default-500"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
              {exportState.status === "error" && (
                <div
                  className="flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] text-danger truncate max-w-[150px]">
                    {exportState.message}
                  </span>
                  <button
                    onClick={() => setExportState({ status: "idle" })}
                    className="p-0.5 text-default-300 hover:text-default-500"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
            </div>
          )}
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
              activeClipIndex={safeActiveClipIndex}
              onActiveClipChange={handleActiveClipChange}
              scrubTime={scrubTime}
            />
          </div>

          {/* Tracks — right side */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Shared horizontal scroll for ruler + all tracks */}
            <div className="overflow-x-auto min-w-0">
              <div className="min-w-fit">
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
                    onClipClick={handleActiveClipChange}
                    onRemoveClip={onRemoveClip}
                    onTrimChange={handleTrimChange}
                    onTrimScrub={handleTrimScrub}
                    dragIndex={dragIndex}
                    dropSlot={dropSlot}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                  />
                </div>

                {/* Audio track */}
                <div className="border-b border-divider">
                  <TimelineTrack
                    label="Audio"
                    variant="audio"
                    clips={clips}
                    activeClipId={activeClipId}
                    onClipClick={handleActiveClipChange}
                    dragIndex={dragIndex}
                    dropSlot={dropSlot}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              </div>
            </div>

            {/* Bottom spacer */}
            <div className="flex-1 bg-default-50/30" />
          </div>
        </div>
      )}
    </div>
  );
}

function TimeRuler({ clips }: { clips: TimelineClip[] }) {
  if (clips.length === 0) {
    return <span className="text-[9px] text-default-300">00:00</span>;
  }

  const pxPerSecond = 30;
  const minClipWidth = 120;
  let cumulative = 0;
  const markers: { position: number; label: string }[] = [
    { position: 0, label: "0:00" },
  ];

  for (const clip of clips) {
    const dur = getEffectiveDuration(clip) || 4;
    cumulative += dur;
    const width = Math.max(minClipWidth, dur * pxPerSecond);
    markers.push({
      position: markers[markers.length - 1].position + width + 4,
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
