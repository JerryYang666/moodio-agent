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
  X,
  Scissors,
  FileCode,
} from "lucide-react";
import type { TimelineClip } from "./types";
import { getTimelineStorageKey, getEffectiveDuration } from "./types";
import TimelineTrack from "./TimelineTrack";
import { type DropSide } from "./TimelineClipCard";
import TimelinePreview, { type TimelinePreviewHandle } from "./TimelinePreview";
import {
  computeClipRanges,
  computeTimelineTime,
  pxToClipTime,
  timelineTimeToPx,
} from "@/lib/timeline/playhead";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/dropdown";
import {
  buildExportRequest,
  SUPPORTED_OUTPUT_FORMATS,
  type OutputFormat,
} from "@/lib/timeline/export";
import {
  generateFcpXml,
  generateFcpxml,
  downloadProjectBundle,
} from "@/lib/timeline/exportFcpXml";

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
  onSplitClip?: (clipId: string, splitTime: number) => void;
  desktopId?: string;
  /** Callback for telemetry when export is triggered */
  onExportTrack?: (data: {
    clipCount: number;
    clips: Array<{ clipId: string; assetId: string; trimStart: number; trimEnd: number }>;
    outputFormat: string;
  }) => void;
}

const PANEL_HEIGHT = 260;

type ExportState =
  | { status: "idle" }
  | { status: "exporting" }
  | { status: "error"; message: string };

/**
 * Browser-side attachment download. The server also sets
 * `Content-Disposition: attachment` on the pre-signed URL, which does the
 * heavy lifting cross-origin; the `download` attribute is a hint for
 * same-origin / dev cases.
 */
function triggerBrowserDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type XmlFormat = "fcp7" | "fcpxml";

type XmlExportState =
  | { status: "idle" }
  | { status: "exporting"; format: XmlFormat; done: number; total: number }
  | { status: "error"; message: string };

export default function TimelinePanel({
  clips,
  isExpanded,
  onToggleExpanded,
  onRemoveClip,
  onReorderClips,
  onClearTimeline,
  onUpdateClip,
  onSplitClip,
  desktopId,
  onExportTrack,
}: TimelinePanelProps) {
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({
    status: "idle",
  });
  const [xmlState, setXmlState] = useState<XmlExportState>({ status: "idle" });

  const previewRef = useRef<TimelinePreviewHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tracksInnerRef = useRef<HTMLDivElement>(null);

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

  const activeClip = clips[safeActiveClipIndex] ?? null;
  const activeClipId = activeClip?.id ?? null;

  const canSplit =
    !!activeClip &&
    currentTime > (activeClip.trimStart ?? 0) + 0.1 &&
    currentTime < (activeClip.trimEnd ?? activeClip.duration) - 0.1;

  const handleSplit = useCallback(() => {
    if (!activeClip || !onSplitClip || !canSplit) return;
    onSplitClip(activeClip.id, currentTime);
  }, [activeClip, canSplit, currentTime, onSplitClip]);

  const handleXmlExport = useCallback(
    async (format: XmlFormat) => {
      if (clips.length === 0 || xmlState.status === "exporting") return;
      setXmlState({ status: "exporting", format, done: 0, total: clips.length });
      try {
        const xml =
          format === "fcp7" ? generateFcpXml(clips) : generateFcpxml(clips);
        const ext = format === "fcp7" ? ".xml" : ".fcpxml";
        await downloadProjectBundle(
          xml,
          ext,
          clips,
          undefined,
          (done, total) =>
            setXmlState({ status: "exporting", format, done, total })
        );
        setXmlState({ status: "idle" });
      } catch (err) {
        setXmlState({
          status: "error",
          message: err instanceof Error ? err.message : "Export failed",
        });
        setTimeout(() => setXmlState({ status: "idle" }), 4000);
      }
    },
    [clips, xmlState.status]
  );

  // Declared early so the freeze effect below can read it without a TDZ.
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const handleTrimScrub = useCallback((time: number | null) => {
    setScrubTime(time);
  }, []);

  const clipRanges = useMemo(() => computeClipRanges(clips), [clips]);
  const clipRangesRef = useRef(clipRanges);
  clipRangesRef.current = clipRanges;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  const timelineTime = useMemo(
    () => computeTimelineTime(clips, safeActiveClipIndex, currentTime),
    [clips, safeActiveClipIndex, currentTime]
  );

  const playheadPx = useMemo(
    () => timelineTimeToPx(timelineTime, clipRanges),
    [timelineTime, clipRanges]
  );

  // Freeze the playhead pixel for the duration of a trim-handle drag.
  // Without this, both the shifting clip layout and the clip-card's
  // onClick(index) (which changes the active clip) cause the playhead to
  // jump. On release we map the frozen pixel back through the post-trim
  // layout and seek the video to match.
  const [frozenPlayheadPx, setFrozenPlayheadPx] = useState<number | null>(null);
  const playheadPxRef = useRef(playheadPx);
  playheadPxRef.current = playheadPx;

  const handleTrimDragStart = useCallback(() => {
    if (playheadPxRef.current != null) {
      setFrozenPlayheadPx(playheadPxRef.current);
    }
  }, []);

  const frozenPxRef = useRef<number | null>(null);
  frozenPxRef.current = frozenPlayheadPx;
  useEffect(() => {
    if (scrubTime == null && frozenPxRef.current != null) {
      const hit = pxToClipTime(
        frozenPxRef.current,
        clipsRef.current,
        clipRangesRef.current
      );
      if (hit) previewRef.current?.seekTo(hit.clipIndex, hit.sourceTime);
      setFrozenPlayheadPx(null);
    }
  }, [scrubTime]);

  const renderedPlayheadPx =
    frozenPlayheadPx != null ? frozenPlayheadPx : playheadPx;

  const handleSeekInClip = useCallback(
    (index: number, sourceTime: number) => {
      previewRef.current?.seekTo(index, sourceTime);
    },
    []
  );

  // Viewport clientX → seek target within tracks-inner. Clicks past
  // either end clamp to the first/last clip's trim edge; clicks in
  // inter-clip gaps are no-ops (those are layout indicators).
  const seekFromClientX = useCallback((clientX: number) => {
    const rect = tracksInnerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    const ranges = clipRangesRef.current;
    const clipsList = clipsRef.current;
    if (ranges.length === 0) return;

    const hit = pxToClipTime(px, clipsList, ranges);
    if (hit) {
      previewRef.current?.seekTo(hit.clipIndex, hit.sourceTime);
      return;
    }

    const first = ranges[0];
    const last = ranges[ranges.length - 1];
    if (px < first.leftPx) {
      const firstClip = clipsList[0];
      previewRef.current?.seekTo(0, firstClip.trimStart ?? 0);
    } else if (px > last.leftPx + last.widthPx) {
      const lastClip = clipsList[last.clipIndex];
      previewRef.current?.seekTo(
        last.clipIndex,
        lastClip.trimEnd ?? lastClip.duration
      );
    }
  }, []);

  // Shared mousedown handler for the playhead grab and the ruler row.
  // `seekOnDown` is false when the playhead itself is grabbed (the
  // cursor is already on it, so we only want drag-to-scrub, not a seek).
  const startScrubDrag = useCallback(
    (e: React.MouseEvent, seekOnDown: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      const preview = previewRef.current;
      const wasPlaying = preview?.getIsPlaying() ?? false;
      if (wasPlaying) preview?.pause();
      if (seekOnDown) seekFromClientX(e.clientX);

      const onMove = (ev: MouseEvent) => seekFromClientX(ev.clientX);
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (wasPlaying) previewRef.current?.play();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [seekFromClientX]
  );

  const handlePlayheadMouseDown = useCallback(
    (e: React.MouseEvent) => startScrubDrag(e, false),
    [startScrubDrag]
  );

  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      startScrubDrag(e, true);
    },
    [startScrubDrag]
  );

  // Auto-scroll the track container during playback so the playhead stays visible.
  useEffect(() => {
    if (!isPlaying || playheadPx == null) return;
    const sc = scrollContainerRef.current;
    if (!sc) return;
    const viewLeft = sc.scrollLeft;
    const viewRight = viewLeft + sc.clientWidth;
    const margin = 40;
    if (playheadPx > viewRight - margin) {
      sc.scrollLeft = playheadPx - sc.clientWidth + margin;
    } else if (playheadPx < viewLeft + margin) {
      sc.scrollLeft = Math.max(0, playheadPx - margin);
    }
  }, [playheadPx, isPlaying]);

  const handleActiveClipChange = useCallback((index: number) => {
    setActiveClipIndex(index);
  }, []);

  const handleTrimChange = useCallback(
    (clipId: string, trimStart: number, trimEnd: number) => {
      onUpdateClip?.(clipId, { trimStart, trimEnd });
    },
    [onUpdateClip]
  );

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

    // Research telemetry: video_export_started
    if (onExportTrack) {
      onExportTrack({
        clipCount: clips.length,
        clips: clips.map((c) => ({
          clipId: c.id,
          assetId: c.assetId,
          trimStart: c.trimStart ?? 0,
          trimEnd: c.trimEnd ?? c.duration,
        })),
        outputFormat: format,
      });
    }

    try {
      const payload = buildExportRequest(clips, desktopId, format);
      const res = await fetch("/api/render/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        triggerBrowserDownload(
          data.downloadUrl,
          `moodio-export.${format}`
        );
        setExportState({ status: "idle" });
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

  // Dev-mode: expose buildExportRequest on window for console testing
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !desktopId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__buildExportRequest = (format?: OutputFormat) => {
      const key = getTimelineStorageKey(desktopId);
      const raw = localStorage.getItem(key);
      if (!raw) return { error: `No timeline data at key: ${key}` };
      const timeline = JSON.parse(raw);
      return buildExportRequest(timeline.clips, timeline.desktopId, format ?? "mp4");
    };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__buildExportRequest;
    };
  }, [desktopId]);

  return (
    <div className="flex flex-col border-t border-divider bg-background/95 backdrop-blur-sm select-none">
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
          {clips.length > 0 && isExpanded && onSplitClip && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSplit();
              }}
              disabled={!canSplit}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-xs hover:bg-primary/10 text-default-400 hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-default-400"
              title="Split at playhead"
            >
              <Scissors size={12} />
            </button>
          )}
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
                    disabledKeys={
                      xmlState.status === "exporting"
                        ? ["fcp7-xml", "fcpxml"]
                        : []
                    }
                    onAction={(key) => {
                      const k = String(key);
                      if (k === "fcp7-xml") handleXmlExport("fcp7");
                      else if (k === "fcpxml") handleXmlExport("fcpxml");
                      else handleExport(k as OutputFormat);
                    }}
                  >
                    <DropdownSection title="Export as" showDivider>
                      {SUPPORTED_OUTPUT_FORMATS.map((f) => (
                        <DropdownItem key={f} startContent={<Film size={14} />}>
                          {f.toUpperCase()}
                        </DropdownItem>
                      ))}
                    </DropdownSection>
                    <DropdownSection title="Project file">
                      <DropdownItem
                        key="fcp7-xml"
                        startContent={
                          xmlState.status === "exporting" &&
                          xmlState.format === "fcp7" ? (
                            <Loader2
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            <FileCode size={14} />
                          )
                        }
                        description="Premiere Pro, DaVinci Resolve"
                      >
                        FCP7 XML (.xml)
                      </DropdownItem>
                      <DropdownItem
                        key="fcpxml"
                        startContent={
                          xmlState.status === "exporting" &&
                          xmlState.format === "fcpxml" ? (
                            <Loader2
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            <FileCode size={14} />
                          )
                        }
                        description="Final Cut Pro"
                      >
                        FCPXML (.fcpxml)
                      </DropdownItem>
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

      {isExpanded && (
        <div
          className="flex border-t border-divider"
          style={{ height: PANEL_HEIGHT }}
        >
          <div className="w-[240px] shrink-0 border-r border-divider p-2">
            <TimelinePreview
              ref={previewRef}
              clips={clips}
              activeClipIndex={safeActiveClipIndex}
              onActiveClipChange={handleActiveClipChange}
              scrubTime={scrubTime}
              onCurrentTimeChange={setCurrentTime}
              onPlayingChange={setIsPlaying}
            />
          </div>

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="overflow-x-auto min-w-0" ref={scrollContainerRef}>
              <div className="min-w-fit relative" ref={tracksInnerRef}>
                {/* Ruler bar — click/drag to seek the playhead. */}
                <div
                  className={`flex items-center h-[24px] border-b border-divider bg-default-50/50 shrink-0 ${
                    clips.length > 0 ? "cursor-pointer select-none" : ""
                  }`}
                  onMouseDown={
                    clips.length > 0 ? handleRulerMouseDown : undefined
                  }
                >
                  <div className="w-[80px] shrink-0" />
                  <div className="flex-1 flex items-center px-2">
                    <TimeRuler clips={clips} />
                  </div>
                </div>

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
                    onTrimDragStart={handleTrimDragStart}
                    onSeekInClip={handleSeekInClip}
                    dragIndex={dragIndex}
                    dropSlot={dropSlot}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                  />
                </div>

                <div className="border-b border-divider">
                  <TimelineTrack
                    label="Audio"
                    variant="audio"
                    clips={clips}
                    activeClipId={activeClipId}
                    onClipClick={handleActiveClipChange}
                    onSeekInClip={handleSeekInClip}
                    dragIndex={dragIndex}
                    dropSlot={dropSlot}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                  />
                </div>

                {clips.length > 0 && renderedPlayheadPx != null && (
                  <Playhead
                    px={renderedPlayheadPx}
                    onDragStart={handlePlayheadMouseDown}
                  />
                )}
              </div>
            </div>

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

function Playhead({
  px,
  onDragStart,
}: {
  px: number;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  const MARKER_WIDTH = 12;
  const MARKER_HEIGHT = 14;
  return (
    <div
      className="absolute top-0 bottom-0 z-20 pointer-events-none"
      style={{ left: px, width: 0 }}
    >
      {/* Grab head — flat-top marker with triangular bottom pointing at the line */}
      <div
        onMouseDown={onDragStart}
        className="absolute top-0 pointer-events-auto cursor-grab active:cursor-grabbing bg-primary"
        style={{
          width: MARKER_WIDTH,
          height: MARKER_HEIGHT,
          left: -(MARKER_WIDTH / 2),
          clipPath: "polygon(0% 0%, 100% 0%, 100% 55%, 50% 100%, 0% 55%)",
        }}
      />
      {/* Vertical line — spans the ruler + both tracks, meets the marker's bottom tip */}
      <div
        className="absolute bg-primary pointer-events-none"
        style={{ top: MARKER_HEIGHT, bottom: 0, left: -1, width: 2 }}
      />
    </div>
  );
}
