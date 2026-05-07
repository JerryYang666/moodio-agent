"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Select, SelectItem } from "@heroui/select";
import { Input } from "@heroui/input";
import { Image } from "@heroui/image";
import { Tab, Tabs } from "@heroui/tabs";
import { Search, Expand, Camera, Star, X, Check, Video, Music, FolderTree, Layers, Plus } from "lucide-react";
import AudioPlayer from "@/components/audio-player";
import { siteConfig } from "@/config/site";
import { useGetCollectionsQuery } from "@/lib/redux/services/next-api";
import AssetPickerUnifiedTree, {
  type UnifiedSelection,
} from "./asset-picker-unified-tree";
import AssetPickerBreadcrumbs from "./asset-picker-breadcrumbs";
import type { ElementAsset } from "@/lib/video/models";
import { blobToWav } from "@/lib/audio/encode-wav";

export type AssetSummary = {
  id: string;
  projectId: string;
  collectionId: string | null;
  imageId: string;
  assetId?: string;
  imageUrl: string;
  videoUrl?: string;
  audioUrl?: string;
  /** Only populated for images. */
  thumbnailSmUrl?: string;
  /** Only populated for images. */
  thumbnailMdUrl?: string;
  assetType?:
    | "image"
    | "video"
    | "public_image"
    | "public_video"
    | "audio"
    | "element";
  chatId: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error";
  };
  /**
   * Populated when assetType === "element". Structured fields for the
   * aggregated element, plus resolved URLs for the constituent images/video
   * so the grid tile can render a composite preview without extra fetches.
   */
  elementDetails?: ElementAsset & {
    imageUrls?: string[];
    videoUrl?: string;
  };
  rating?: number | null;
  addedAt: Date;
};

type Project = {
  id: string;
  name: string;
  isDefault: boolean;
  isOwner: boolean;
};

type AssetsPageResponse = {
  assets?: AssetSummary[];
  hasMore?: boolean;
  nextOffset?: number | null;
};

// On macOS Safari with Continuity Camera, `facingMode: "environment"` matches
// the paired iPhone's rear camera and gets picked over the built-in webcam.
// Only request the rear camera on actual mobile devices.
const prefersRearCamera = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

const buildVideoConstraints = (
  width: number,
  height: number,
  deviceId?: string | null
): MediaTrackConstraints => {
  const constraints: MediaTrackConstraints = {
    width: { ideal: width },
    height: { ideal: height },
  };
  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  } else if (prefersRearCamera()) {
    constraints.facingMode = { ideal: "environment" };
  }
  return constraints;
};

/** Memoized grid item – only re-renders when its own selection state or asset changes */
const AssetGridItem = React.memo(function AssetGridItem({
  asset,
  index,
  isSelected,
  multiSelect,
  disabledReason,
  onClick,
  onExpand,
  untitledLabel,
  viewFullLabel,
  assetAltLabel,
}: {
  asset: AssetSummary;
  index: number;
  isSelected: boolean;
  multiSelect: boolean;
  /** When set, the tile is shown but not clickable; tooltip explains why. */
  disabledReason?: string | null;
  onClick: (asset: AssetSummary, index: number, e: React.MouseEvent) => void;
  onExpand: (asset: AssetSummary) => void;
  untitledLabel: string;
  viewFullLabel: string;
  assetAltLabel: string;
}) {
  const isElement = asset.assetType === "element";
  const elementImageUrls = asset.elementDetails?.imageUrls ?? [];
  const elementVideoUrl = asset.elementDetails?.videoUrl;
  const elementVoiceId = asset.elementDetails?.voiceId;
  const isDisabled = Boolean(disabledReason);
  return (
    <div
      className={`group relative rounded-lg overflow-hidden border border-divider bg-default-100 ${multiSelect && isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
      title={disabledReason || undefined}
    >
      <div className="aspect-square relative">
        <button
          className="w-full h-full"
          onClick={(e) => {
            if (isDisabled) {
              e.stopPropagation();
              return;
            }
            onClick(asset, index, e);
          }}
          disabled={isDisabled}
        >
          {isElement ? (
            /* Composite element preview: up to 4 images in a 2×2 grid */
            <div
              className={`w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5 bg-default-200 ${multiSelect && isSelected ? "opacity-80" : ""}`}
            >
              {Array.from({ length: 4 }).map((_, i) => {
                const url = elementImageUrls[i];
                return (
                  <div
                    key={i}
                    className="relative bg-default-100 overflow-hidden"
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-default-300">
                        <Layers size={12} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : asset.assetType === "audio" ? (
            <div className={`w-full h-full flex items-center justify-center bg-linear-to-br from-violet-500/20 to-purple-600/20 ${multiSelect && isSelected ? "opacity-80" : ""}`}>
              <Music size={32} className="text-violet-400" />
            </div>
          ) : (
            <Image
              src={
                asset.assetType === "image" && asset.thumbnailMdUrl
                  ? asset.thumbnailMdUrl
                  : asset.imageUrl
              }
              alt={asset.generationDetails?.title || assetAltLabel}
              radius="none"
              classNames={{
                wrapper: "w-full h-full !max-w-full",
                img: `w-full h-full object-cover ${multiSelect && isSelected ? "opacity-80" : ""}`,
              }}
              onError={
                ((e: React.SyntheticEvent<HTMLImageElement>) => {
                  const target = e.currentTarget;
                  if (asset.imageUrl && target.src !== asset.imageUrl) {
                    target.src = asset.imageUrl;
                  }
                }) as unknown as () => void
              }
            />
          )}
        </button>

        {/* Element badges: element icon + video/voice indicators */}
        {isElement && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
            <span className="text-[9px] font-semibold bg-sky-600/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Layers size={8} />
            </span>
            {elementVideoUrl && (
              <span className="text-[9px] font-semibold bg-danger/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Video size={8} />
              </span>
            )}
            {elementVoiceId && (
              <span className="text-[9px] font-semibold bg-violet-600/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Music size={8} />
              </span>
            )}
          </div>
        )}

        {/* Audio badge */}
        {asset.assetType === "audio" && (
          <div className="absolute bottom-8 right-1.5 z-10">
            <span className="text-[9px] font-semibold bg-violet-600/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Music size={8} />
            </span>
          </div>
        )}

        {/* Video badge */}
        {asset.assetType === "video" && (
          <div className="absolute bottom-8 right-1.5 z-10">
            <span className="text-[9px] font-semibold bg-danger/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Video size={8} />
            </span>
          </div>
        )}

        {/* Selection checkbox overlay */}
        {multiSelect && (
          <div
            className="absolute top-2 left-2 z-20 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onClick(asset, index, e as unknown as React.MouseEvent);
            }}
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                isSelected
                  ? "bg-primary text-white"
                  : "bg-background/80 backdrop-blur-sm border border-default-300"
              }`}
            >
              {isSelected && <Check size={14} />}
            </div>
          </div>
        )}

        {/* Expand button */}
        <button
          className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onExpand(asset);
          }}
          title={viewFullLabel}
        >
          <Expand size={14} />
        </button>

        {/* Bottom overlay: title + star rating (collection style) */}
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-black/70 to-transparent pt-6 pb-1.5 px-2 pointer-events-none">
          <p className="text-xs text-white truncate">
            {asset.generationDetails?.title || untitledLabel}
          </p>
          <div className="flex gap-0.5 mt-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={12}
                className={
                  star <= (asset.rating ?? 0)
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-white/50"
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

const GRID_GAP = 12; // gap-3 = 0.75rem = 12px
const ASSET_PAGE_SIZE = 40;
const LOAD_MORE_THRESHOLD_PX = 320;
const COL_BREAKPOINTS = [
  { minWidth: 768, cols: 4 },  // md
  { minWidth: 640, cols: 3 },  // sm
  { minWidth: 0, cols: 2 },
];

/** Virtualised grid – only renders rows visible in the scroll viewport. */
function VirtualAssetGrid({
  assets,
  selectedIds,
  multiSelect,
  hasMore,
  isLoadingMore,
  validateOnSelect,
  onLoadMore,
  onClick,
  onExpand,
  untitledLabel,
  viewFullLabel,
  assetAltLabel,
}: {
  assets: AssetSummary[];
  selectedIds: Set<string>;
  multiSelect: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  /** When provided, returns a user-visible reason for blocking selection, or null to allow. */
  validateOnSelect?: (asset: AssetSummary) => string | null;
  onLoadMore: () => void;
  onClick: (asset: AssetSummary, index: number, e: React.MouseEvent) => void;
  onExpand: (asset: AssetSummary) => void;
  untitledLabel: string;
  viewFullLabel: string;
  assetAltLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(4);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setContainerWidth(w);
      const cols = COL_BREAKPOINTS.find((bp) => w >= bp.minWidth)!.cols;
      setColumnCount(cols);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(assets.length / columnCount);

  // Each cell is aspect-square, so cell height = cell width.
  // Row height = cell height + gap (spacing to next row).
  const rowHeight = useMemo(() => {
    if (containerWidth === 0) return 180;
    const cellWidth = (containerWidth - (columnCount - 1) * GRID_GAP) / columnCount;
    return cellWidth + GRID_GAP;
  }, [containerWidth, columnCount]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 2,
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const prevRowHeightRef = useRef<number | null>(null);
  // Re-measure only when row height actually changes (usually on resize).
  // Avoid re-measuring during selection updates.
  useEffect(() => {
    if (prevRowHeightRef.current === rowHeight) return;
    prevRowHeightRef.current = rowHeight;
    virtualizerRef.current.measure();
  }, [rowHeight]);

  const maybeLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    const el = scrollRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight);
    if (remaining <= LOAD_MORE_THRESHOLD_PX) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Ensure we fetch more if the viewport isn't filled yet.
  useEffect(() => {
    maybeLoadMore();
  }, [assets.length, maybeLoadMore]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto p-2 pr-3"
      onScroll={maybeLoadMore}
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const startIdx = vRow.index * columnCount;
          return (
            <div
              key={vRow.key}
              className="absolute left-0 w-full"
              style={{
                top: vRow.start,
                height: rowHeight - GRID_GAP,
                display: "grid",
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: GRID_GAP,
              }}
            >
              {Array.from({ length: columnCount }, (_, col) => {
                const idx = startIdx + col;
                if (idx >= assets.length) return <div key={col} />;
                const a = assets[idx];
                return (
                  <AssetGridItem
                    key={a.id}
                    asset={a}
                    index={idx}
                    isSelected={selectedIds.has(a.id)}
                    multiSelect={multiSelect}
                    disabledReason={validateOnSelect?.(a) ?? null}
                    onClick={onClick}
                    onExpand={onExpand}
                    untitledLabel={untitledLabel}
                    viewFullLabel={viewFullLabel}
                    assetAltLabel={assetAltLabel}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      {isLoadingMore && (
        <div className="flex items-center justify-center py-2">
          <Spinner size="sm" />
        </div>
      )}
    </div>
  );
}

export default function AssetPickerModal({
  isOpen,
  onOpenChange,
  onSelect,
  onSelectMultiple,
  onUpload,
  validateOnSelect,
  hideLibraryTab = false,
  multiSelect = false,
  maxSelectCount,
  acceptTypes,
  onCreateNew,
}: {
  isOpen: boolean;
  onOpenChange: () => void;
  onSelect: (asset: AssetSummary) => void;
  /** Called with all selected assets when multiSelect is enabled and user confirms */
  onSelectMultiple?: (assets: AssetSummary[]) => void;
  onUpload: (files: File[]) => void;
  /** Optional per-tile validation — return a non-null string to disable selection (with a tooltip). */
  validateOnSelect?: (asset: AssetSummary) => string | null;
  /** When true, only shows the upload tab (hides the library picker) */
  hideLibraryTab?: boolean;
  /** Enable multiselect mode in the library tab */
  multiSelect?: boolean;
  /** Max number of images that can be selected (multiSelect mode) */
  maxSelectCount?: number;
  /** When provided, only show assets of these types (and restrict upload accordingly) */
  acceptTypes?: ("image" | "video" | "audio" | "element")[];
  /**
   * Optional. When set, a "Create new" call-to-action is rendered above the
   * library grid. Used for the chat composer's element flow: user can pick
   * an existing library element OR create one on the spot. Caller decides
   * what "create" means (typically: open ElementEditorController).
   */
  onCreateNew?: { label: string; onPress: () => void };
}) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const { data: collections = [] } = useGetCollectionsQuery();
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const [nextAssetsOffset, setNextAssetsOffset] = useState(0);
  const [loadingMoreAssets, setLoadingMoreAssets] = useState(false);
  const [selection, setSelection] = useState<UnifiedSelection>({ kind: "recent" });
  const [mobileBrowserOpen, setMobileBrowserOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tabKey, setTabKey] = useState<
    "library" | "upload" | "camera" | "audio-record"
  >("library");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetSummary | null>(null);

  // Multiselect state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);

  // Star filter state
  const [filterRating, setFilterRating] = useState<number | null>(null);

  // Stabilize callback props in refs so handleAssetClick never changes due to
  // parent re-renders passing new inline functions (e.g. onOpenChange, onSelect).
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const onSelectMultipleRef = useRef(onSelectMultiple);
  onSelectMultipleRef.current = onSelectMultiple;
  const maxSelectCountRef = useRef(maxSelectCount);
  maxSelectCountRef.current = maxSelectCount;

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  // Ref mirror so useCallbacks can read the latest selection without re-creating.
  const selectedCameraIdRef = useRef<string | null>(null);
  selectedCameraIdRef.current = selectedCameraId;

  // Video recording state
  const [cameraMode, setCameraMode] = useState<"photo" | "video">("photo");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const MAX_VIDEO_RECORDING_SECONDS = 15;

  // Audio recording state — parallel to the video recorder but on a mic-only
  // stream. Target range matches FAL create-voice: 5–30s single-voice clips.
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecordingSeconds, setAudioRecordingSeconds] = useState(0);
  const audioRecordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const MIN_AUDIO_RECORDING_SECONDS = 5;
  const MAX_AUDIO_RECORDING_SECONDS = 30;

  // Show/hide tab logic based on acceptTypes:
  //   - cameraOnly videos/images → camera tab visible, audio tab hidden
  //   - audio in acceptTypes     → audio tab visible
  //   - audio-only               → camera tab hidden (you can't get mp3 from a camera)
  const showAudioTab =
    !acceptTypes || acceptTypes.length === 0 || acceptTypes.includes("audio");
  const showCameraTab =
    !acceptTypes ||
    acceptTypes.length === 0 ||
    acceptTypes.includes("image") ||
    acceptTypes.includes("video");

  useEffect(() => {
    if (!isOpen) {
      setPreviewAsset(null);
      setSelectedIds(new Set());
      lastClickedIndexRef.current = null;
      setFilterRating(null);
      setSelection({ kind: "recent" });
      setMobileBrowserOpen(false);
      setHasMoreAssets(false);
      setNextAssetsOffset(0);
      setLoadingMoreAssets(false);
      stopCamera();
      setCapturedPhoto(null);
      setCameraMode("photo");
      setIsRecordingVideo(false);
      setRecordingSeconds(0);
      if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      // Audio cleanup mirrors video cleanup on close.
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      setIsRecordingAudio(false);
      setAudioRecordingSeconds(0);
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
      setAudioError(null);
      if (audioRecordingTimerRef.current)
        clearInterval(audioRecordingTimerRef.current);
      return;
    }
    setTabKey(hideLibraryTab ? "upload" : "library");
    setUploadError(null);
    const load = async () => {
      setLoading(true);
      try {
        const projectsRes = await fetch("/api/projects");
        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setProjects([...(data.projects || []), ...(data.sharedProjects || [])]);
        }
      } catch (e) {
        console.error("Failed to load picker metadata", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen]);

  // Stop camera when switching away from camera tab
  useEffect(() => {
    if (tabKey !== "camera") {
      stopCamera();
      setCapturedPhoto(null);
      setIsRecordingVideo(false);
      setRecordingSeconds(0);
      if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    } else if (acceptTypes && acceptTypes.length > 0) {
      if (acceptTypes.includes("video") && !acceptTypes.includes("image")) {
        setCameraMode("video");
      } else if (acceptTypes.includes("image") && !acceptTypes.includes("video")) {
        setCameraMode("photo");
      }
    }
  }, [tabKey, acceptTypes]);

  // Stop audio recording when switching away from the audio tab.
  useEffect(() => {
    if (tabKey !== "audio-record") {
      if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
        audioRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      setIsRecordingAudio(false);
      setAudioRecordingSeconds(0);
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
      setAudioError(null);
      if (audioRecordingTimerRef.current)
        clearInterval(audioRecordingTimerRef.current);
    }
  }, [tabKey, recordedAudioUrl]);

  // Collection name for breadcrumb header when inside a folder.
  const selectedCollectionName = useMemo(() => {
    if (selection.kind !== "folder") return null;
    return collections.find((c) => c.id === selection.collectionId)?.name ?? null;
  }, [collections, selection]);

  const loadAssetsPage = useCallback(
    async ({ offset, append }: { offset: number; append: boolean }) => {
      if (append) {
        setLoadingMoreAssets(true);
      } else {
        setLoading(true);
      }
      try {
        const params = new URLSearchParams();
        params.set("limit", String(ASSET_PAGE_SIZE));
        params.set("offset", String(offset));
        if (selection.kind === "folder") {
          params.set("collectionId", selection.collectionId);
          if (selection.folderId) {
            params.set("folderId", selection.folderId);
          } else if (selection.folderRoot) {
            params.set("folderRoot", "true");
          }
        } else if (selection.kind === "collection") {
          params.set("collectionId", selection.collectionId);
        } else if (selection.kind === "project") {
          params.set("projectId", selection.projectId);
        }
        const res = await fetch(`/api/assets?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as AssetsPageResponse;
        // Only include audio/element assets when explicitly requested via acceptTypes.
        const incoming = (data.assets || []).filter((a) => {
          const type = a.assetType as string;
          if (type === "audio") return acceptTypes?.includes("audio") ?? false;
          if (type === "element") return acceptTypes?.includes("element") ?? false;
          return true;
        });

        setAssets((prev) => {
          if (!append) return incoming;
          // De-dupe by id in case upstream data changed while paginating.
          const byId = new Map<string, AssetSummary>();
          for (const a of prev) byId.set(a.id, a);
          for (const a of incoming) byId.set(a.id, a);
          return Array.from(byId.values());
        });
        const hasMore = Boolean(data.hasMore);
        setHasMoreAssets(hasMore);
        setNextAssetsOffset(
          typeof data.nextOffset === "number"
            ? data.nextOffset
            : offset + incoming.length
        );
      } catch (e) {
        console.error("Failed to load assets", e);
      } finally {
        if (append) {
          setLoadingMoreAssets(false);
        } else {
          setLoading(false);
        }
      }
    },
    [selection]
  );

  useEffect(() => {
    if (!isOpen) return;
    setAssets([]);
    setHasMoreAssets(false);
    setNextAssetsOffset(0);
    setLoadingMoreAssets(false);
    void loadAssetsPage({ offset: 0, append: false });
  }, [isOpen, selection, loadAssetsPage]);

  const handleLoadMoreAssets = useCallback(() => {
    if (loading || loadingMoreAssets || !hasMoreAssets) return;
    void loadAssetsPage({ offset: nextAssetsOffset, append: true });
  }, [hasMoreAssets, loadAssetsPage, loading, loadingMoreAssets, nextAssetsOffset]);

  const filteredAssets = useMemo(() => {
    let result = assets;
    if (acceptTypes && acceptTypes.length > 0) {
      result = result.filter((a) => {
        const type = a.assetType || "image";
        const baseType = type.replace("public_", "") as
          | "image"
          | "video"
          | "audio"
          | "element";
        return acceptTypes.includes(baseType);
      });
    }
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((a) =>
        (a.generationDetails?.title || "").toLowerCase().includes(q)
      );
    }
    if (filterRating !== null) {
      result = result.filter(
        (a) => a.rating !== null && a.rating !== undefined && a.rating >= filterRating
      );
    }
    return result;
  }, [assets, query, filterRating, acceptTypes]);

  // Camera functions
  // Populate the list of available cameras. Labels are only exposed after
  // the user grants permission, so this must be called after getUserMedia.
  const refreshVideoDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(videoInputs);
      // Sync the picker to the camera the browser actually chose, so the
      // initial selection reflects reality rather than just the first device.
      const activeId = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
      if (activeId && activeId !== selectedCameraIdRef.current) {
        setSelectedCameraId(activeId);
      }
    } catch (err) {
      console.error("enumerateDevices error:", err);
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: buildVideoConstraints(1920, 1080, selectedCameraIdRef.current),
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      refreshVideoDevices();
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(t("assetPicker.cameraAccessDenied"));
      setCameraActive(false);
    }
  }, [t, refreshVideoDevices]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedPhoto(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const useCapturedPhoto = useCallback(
    async (onClose: () => void) => {
      if (!capturedPhoto) return;
      const res = await fetch(capturedPhoto);
      const blob = await res.blob();
      const file = new File([blob], `camera-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      onUpload([file]);
      setCapturedPhoto(null);
      onClose();
    },
    [capturedPhoto, onUpload]
  );

  // Video recording functions
  const startVideoRecording = useCallback(async () => {
    setCameraError(null);
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: buildVideoConstraints(1280, 720, selectedCameraIdRef.current),
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      refreshVideoDevices();

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        stopCamera();
      };

      recorder.start(100);
      setIsRecordingVideo(true);
      setRecordingSeconds(0);

      const timerId = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
      recordingTimerRef.current = timerId;
    } catch (err) {
      console.error("Video recording error:", err);
      setCameraError(t("assetPicker.cameraAccessDenied"));
      setCameraActive(false);
    }
  }, [t, stopCamera, recordedVideoUrl, refreshVideoDevices]);

  const handleCameraSelect = useCallback(
    async (deviceId: string) => {
      if (!deviceId || deviceId === selectedCameraIdRef.current) return;
      setSelectedCameraId(deviceId);
      selectedCameraIdRef.current = deviceId;
      // Only restart the preview stream. Don't auto-restart during an active
      // video recording — switching mid-recording would corrupt the file.
      if (cameraActive && !isRecordingVideo && cameraMode === "photo") {
        stopCamera();
        await startCamera();
      }
    },
    [cameraActive, isRecordingVideo, cameraMode, stopCamera, startCamera]
  );

  // Auto-stop recording when reaching the time limit.
  // Kept outside the state updater to avoid side effects in pure functions.
  useEffect(() => {
    if (recordingSeconds >= MAX_VIDEO_RECORDING_SECONDS && isRecordingVideo) {
      mediaRecorderRef.current?.stop();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setIsRecordingVideo(false);
    }
  }, [recordingSeconds, isRecordingVideo]);

  // Clean up the recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const stopVideoRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingVideo(false);
  }, []);

  const useRecordedVideo = useCallback(
    async (onClose: () => void) => {
      if (!recordedVideoUrl) return;
      const res = await fetch(recordedVideoUrl);
      const blob = await res.blob();
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: "video/webm" });
      onUpload([file]);
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
      onClose();
    },
    [recordedVideoUrl, onUpload]
  );

  // ── Audio recording ─────────────────────────────────────────────────────
  const startAudioRecording = useCallback(async () => {
    setAudioError(null);
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      audioStreamRef.current = stream;

      // Pick a mime the browser actually supports. Order matters — Safari
      // prefers audio/mp4 (AAC); Chrome/Firefox default to audio/webm (Opus).
      const candidateMimes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];
      const mimeType =
        candidateMimes.find(
          (m) =>
            typeof MediaRecorder !== "undefined" &&
            MediaRecorder.isTypeSupported(m)
        ) ?? "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      audioRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);
        // Release mic immediately once stopped.
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((tr) => tr.stop());
          audioStreamRef.current = null;
        }
      };

      recorder.start(100);
      setIsRecordingAudio(true);
      setAudioRecordingSeconds(0);
      const timerId = setInterval(() => {
        setAudioRecordingSeconds((prev) => prev + 1);
      }, 1000);
      audioRecordingTimerRef.current = timerId;
    } catch (err) {
      console.error("Audio recording error:", err);
      setAudioError(t("assetPicker.audioAccessDenied"));
      setIsRecordingAudio(false);
    }
  }, [recordedAudioUrl, t]);

  const stopAudioRecording = useCallback(() => {
    if (
      audioRecorderRef.current &&
      audioRecorderRef.current.state !== "inactive"
    ) {
      audioRecorderRef.current.stop();
    }
    if (audioRecordingTimerRef.current) {
      clearInterval(audioRecordingTimerRef.current);
    }
    setIsRecordingAudio(false);
  }, []);

  // Auto-stop at the hard 30s ceiling so the clip stays within FAL's window.
  useEffect(() => {
    if (
      audioRecordingSeconds >= MAX_AUDIO_RECORDING_SECONDS &&
      isRecordingAudio
    ) {
      stopAudioRecording();
    }
  }, [audioRecordingSeconds, isRecordingAudio, stopAudioRecording]);

  const useRecordedAudio = useCallback(
    async (onClose: () => void) => {
      if (!recordedAudioUrl) return;
      const res = await fetch(recordedAudioUrl);
      const srcBlob = await res.blob();
      // Server only accepts mp3/wav (and FAL create-voice accepts .mp3/.wav
      // too). Browsers record to webm/mp4/ogg — transcode to WAV client-side
      // so the file passes validation either way.
      try {
        const wav = await blobToWav(srcBlob);
        const file = new File([wav], `voice-recording-${Date.now()}.wav`, {
          type: "audio/wav",
        });
        onUpload([file]);
      } catch (err) {
        console.error("Audio WAV encode failed:", err);
        setAudioError(t("assetPicker.audioEncodeFailed"));
        return;
      }
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
      onClose();
    },
    [recordedAudioUrl, onUpload, t]
  );

  // Keep filteredAssets in a ref so handleAssetClick doesn't depend on it
  const filteredAssetsRef = useRef(filteredAssets);
  filteredAssetsRef.current = filteredAssets;

  // Multiselect handlers – stable callback using refs for props that change
  // on parent re-renders (onSelect, onOpenChange, maxSelectCount).
  const handleAssetClick = useCallback(
    (asset: AssetSummary, index: number, e: React.MouseEvent) => {
      if (!multiSelect) {
        onSelectRef.current(asset);
        onOpenChangeRef.current();
        return;
      }

      // Shift+click: select range
      if (e.shiftKey && lastClickedIndexRef.current !== null) {
        const start = Math.min(lastClickedIndexRef.current, index);
        const end = Math.max(lastClickedIndexRef.current, index);
        const rangeIds = filteredAssetsRef.current.slice(start, end + 1).map((a) => a.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of rangeIds) {
            if (maxSelectCountRef.current && next.size >= maxSelectCountRef.current && !next.has(id)) continue;
            next.add(id);
          }
          return next;
        });
        lastClickedIndexRef.current = index;
        return;
      }

      // Toggle single selection
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(asset.id)) {
          next.delete(asset.id);
        } else {
          if (maxSelectCountRef.current && next.size >= maxSelectCountRef.current) return prev;
          next.add(asset.id);
        }
        return next;
      });
      lastClickedIndexRef.current = index;
    },
    [multiSelect]
  );

  const handleConfirmSelection = useCallback(
    (onClose: () => void) => {
      const selected = assets.filter((a) => selectedIds.has(a.id));
      if (onSelectMultipleRef.current) {
        onSelectMultipleRef.current(selected);
      } else {
        for (const asset of selected) {
          onSelectRef.current(asset);
        }
      }
      onClose();
    },
    [assets, selectedIds]
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="5xl"
        scrollBehavior="inside"
        classNames={{
          base: "max-h-[90dvh] md:!max-w-[90vw] md:w-[90vw]",
          wrapper: "z-[120]",
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-2">
                <div>{t("assetPicker.title")}</div>
                <Tabs
                  selectedKey={tabKey}
                  onSelectionChange={(k) =>
                    setTabKey(
                      k as "library" | "upload" | "camera" | "audio-record"
                    )
                  }
                  size="sm"
                  variant="underlined"
                >
                  {!hideLibraryTab && (
                    <Tab key="library" title={t("assetPicker.libraryTab")} />
                  )}
                  <Tab key="upload" title={t("assetPicker.uploadTab")} />
                  {showCameraTab && (
                    <Tab key="camera" title={t("assetPicker.cameraTab")} />
                  )}
                  {showAudioTab && (
                    <Tab
                      key="audio-record"
                      title={t("assetPicker.audioRecordTab")}
                    />
                  )}
                </Tabs>
              </ModalHeader>

              <ModalBody className="overflow-hidden">
                {tabKey === "audio-record" ? (
                  /* ── Audio Record Tab ── */
                  <div className="flex flex-col gap-4 items-center">
                    {audioError && (
                      <div className="text-sm text-danger text-center py-2">
                        {audioError}
                      </div>
                    )}

                    <div className="w-full max-w-lg">
                      <div className="text-xs font-medium text-default-600 mb-1">
                        {t("assetPicker.audioRecordReadingTitle")}
                      </div>
                      <div className="rounded-lg border border-divider bg-default-50 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                        {t("assetPicker.audioRecordSamplePassage")}
                      </div>
                      <div className="text-[11px] text-default-500 mt-2">
                        {t("assetPicker.audioRecordHint", {
                          min: MIN_AUDIO_RECORDING_SECONDS,
                          max: MAX_AUDIO_RECORDING_SECONDS,
                        })}
                      </div>
                    </div>

                    {recordedAudioUrl ? (
                      <div className="flex flex-col items-center gap-4 w-full max-w-lg">
                        <audio
                          src={recordedAudioUrl}
                          controls
                          className="w-full"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="flat"
                            onPress={() => {
                              if (recordedAudioUrl)
                                URL.revokeObjectURL(recordedAudioUrl);
                              setRecordedAudioUrl(null);
                              setAudioRecordingSeconds(0);
                            }}
                          >
                            {t("assetPicker.retakeAudio")}
                          </Button>
                          <Button
                            color="primary"
                            isDisabled={
                              audioRecordingSeconds <
                              MIN_AUDIO_RECORDING_SECONDS
                            }
                            onPress={() => useRecordedAudio(onClose)}
                          >
                            {t("assetPicker.useAudio")}
                          </Button>
                        </div>
                        {audioRecordingSeconds < MIN_AUDIO_RECORDING_SECONDS && (
                          <div className="text-[11px] text-warning">
                            {t("assetPicker.audioTooShort", {
                              min: MIN_AUDIO_RECORDING_SECONDS,
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 w-full max-w-lg">
                        <div className="w-full rounded-lg border border-divider bg-black/5 dark:bg-white/5 p-6 flex flex-col items-center gap-3">
                          <div
                            className={`w-20 h-20 rounded-full flex items-center justify-center ${
                              isRecordingAudio
                                ? "bg-danger/20"
                                : "bg-default-200"
                            }`}
                          >
                            <Music
                              size={32}
                              className={
                                isRecordingAudio
                                  ? "text-danger"
                                  : "text-default-500"
                              }
                            />
                          </div>
                          <div className="text-lg font-mono tabular-nums">
                            {audioRecordingSeconds}s /{" "}
                            {MAX_AUDIO_RECORDING_SECONDS}s
                          </div>
                          {isRecordingAudio && (
                            <div className="flex items-center gap-2 text-xs text-danger">
                              <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                              {t("assetPicker.audioRecording")}
                            </div>
                          )}
                        </div>
                        {!isRecordingAudio ? (
                          <Button
                            color="danger"
                            onPress={startAudioRecording}
                          >
                            {t("assetPicker.startAudioRecording")}
                          </Button>
                        ) : (
                          <Button
                            color="danger"
                            variant="bordered"
                            onPress={stopAudioRecording}
                          >
                            {t("assetPicker.stopAudioRecording")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : tabKey === "camera" ? (
                  /* ── Camera Tab ── */
                  <div className="flex flex-col gap-4 items-center">
                    {/* Photo / Video mode toggle — hidden when acceptTypes restricts to one type */}
                    {(!acceptTypes || acceptTypes.length === 0 || (acceptTypes.includes("image") && acceptTypes.includes("video"))) && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={cameraMode === "photo" ? "solid" : "flat"}
                        color={cameraMode === "photo" ? "primary" : "default"}
                        onPress={() => { setCameraMode("photo"); stopVideoRecording(); }}
                      >
                        {t("assetPicker.photoMode")}
                      </Button>
                      <Button
                        size="sm"
                        variant={cameraMode === "video" ? "solid" : "flat"}
                        color={cameraMode === "video" ? "danger" : "default"}
                        onPress={() => { setCameraMode("video"); setCapturedPhoto(null); }}
                      >
                        {t("assetPicker.videoMode")}
                      </Button>
                    </div>
                    )}

                    {cameraError && (
                      <div className="text-sm text-danger text-center py-4">
                        {cameraError}
                      </div>
                    )}

                    {cameraMode === "photo" ? (
                      /* ── Photo mode ── */
                      <>
                        {capturedPhoto ? (
                          <div className="flex flex-col items-center gap-4 w-full">
                            <div className="relative rounded-lg overflow-hidden border border-divider max-w-lg w-full">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={capturedPhoto}
                                alt={t("assetPicker.capturedPhoto")}
                                className="w-full h-auto"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="flat"
                                onPress={() => {
                                  setCapturedPhoto(null);
                                  startCamera();
                                }}
                              >
                                {t("assetPicker.retakePhoto")}
                              </Button>
                              <Button
                                color="primary"
                                onPress={() => useCapturedPhoto(onClose)}
                              >
                                {t("assetPicker.usePhoto")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-4 w-full">
                            <div className="relative rounded-lg overflow-hidden border border-divider bg-black max-w-lg w-full aspect-video">
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                              />
                              <canvas ref={canvasRef} className="hidden" />
                            </div>
                            {cameraActive && videoDevices.length > 1 && (
                              <Select
                                label={t("assetPicker.cameraLabel")}
                                size="sm"
                                selectedKeys={selectedCameraId ? [selectedCameraId] : []}
                                onChange={(e) => {
                                  if (e.target.value) handleCameraSelect(e.target.value);
                                }}
                                className="max-w-lg w-full"
                              >
                                {videoDevices.map((d, i) => (
                                  <SelectItem key={d.deviceId}>
                                    {d.label || t("assetPicker.cameraFallback", { index: i + 1 })}
                                  </SelectItem>
                                ))}
                              </Select>
                            )}
                            {!cameraActive ? (
                              <Button
                                color="primary"
                                startContent={<Camera size={16} />}
                                onPress={startCamera}
                              >
                                {t("assetPicker.startCamera")}
                              </Button>
                            ) : (
                              <Button
                                color="primary"
                                size="lg"
                                isIconOnly
                                className="rounded-full w-16 h-16 border-4 border-white shadow-lg"
                                onPress={capturePhoto}
                                title={t("assetPicker.takePhoto")}
                              >
                                <Camera size={24} />
                              </Button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      /* ── Video recording mode ── */
                      <>
                        {recordedVideoUrl ? (
                          <div className="flex flex-col items-center gap-4 w-full">
                            <div className="relative rounded-lg overflow-hidden border border-divider max-w-lg w-full aspect-video">
                              <video
                                src={recordedVideoUrl}
                                controls
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="flat"
                                onPress={() => {
                                  if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
                                  setRecordedVideoUrl(null);
                                  setRecordingSeconds(0);
                                }}
                              >
                                {t("assetPicker.retakeVideo")}
                              </Button>
                              <Button
                                color="primary"
                                onPress={() => useRecordedVideo(onClose)}
                              >
                                {t("assetPicker.useVideo")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-4 w-full">
                            <div className="relative rounded-lg overflow-hidden border border-divider bg-black max-w-lg w-full aspect-video">
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                              />
                              {isRecordingVideo && (
                                <div className="absolute top-3 right-3 flex items-center gap-2 bg-danger/90 text-white px-3 py-1 rounded-full text-sm font-medium">
                                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                  {recordingSeconds}s / {MAX_VIDEO_RECORDING_SECONDS}s
                                </div>
                              )}
                            </div>
                            {cameraActive && videoDevices.length > 1 && (
                              <Select
                                label={t("assetPicker.cameraLabel")}
                                size="sm"
                                selectedKeys={selectedCameraId ? [selectedCameraId] : []}
                                isDisabled={isRecordingVideo}
                                onChange={(e) => {
                                  if (e.target.value) handleCameraSelect(e.target.value);
                                }}
                                className="max-w-lg w-full"
                              >
                                {videoDevices.map((d, i) => (
                                  <SelectItem key={d.deviceId}>
                                    {d.label || t("assetPicker.cameraFallback", { index: i + 1 })}
                                  </SelectItem>
                                ))}
                              </Select>
                            )}
                            {!isRecordingVideo ? (
                              <Button
                                color="danger"
                                startContent={<Camera size={16} />}
                                onPress={startVideoRecording}
                              >
                                {t("assetPicker.startRecording")}
                              </Button>
                            ) : (
                              <Button
                                color="danger"
                                variant="bordered"
                                onPress={stopVideoRecording}
                              >
                                {t("assetPicker.stopRecording")}
                              </Button>
                            )}
                            <span className="text-xs text-default-400">
                              {t("assetPicker.maxRecordingDuration", { seconds: MAX_VIDEO_RECORDING_SECONDS })}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : tabKey === "upload" ? (
                  /* ── Upload Tab ── */
                  <div className="flex flex-col gap-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept={(() => {
                        if (!acceptTypes || acceptTypes.length === 0) {
                          return [...siteConfig.upload.allowedImageTypes, ...siteConfig.upload.allowedVideoTypes].join(", ");
                        }
                        const types: string[] = [];
                        if (acceptTypes.includes("image")) types.push(...siteConfig.upload.allowedImageTypes);
                        if (acceptTypes.includes("video")) types.push(...siteConfig.upload.allowedVideoTypes);
                        if (acceptTypes.includes("audio")) types.push(...siteConfig.upload.allowedAudioTypes);
                        return types.join(", ");
                      })()}
                      multiple
                      onChange={(e) => {
                        const fileList = e.target.files;
                        if (!fileList || fileList.length === 0) return;
                        const maxBytes = siteConfig.upload.maxFileSizeMB * 1024 * 1024;
                        const validTypes = (() => {
                          if (!acceptTypes || acceptTypes.length === 0) {
                            return [...siteConfig.upload.allowedImageTypes, ...siteConfig.upload.allowedVideoTypes];
                          }
                          const t: string[] = [];
                          if (acceptTypes.includes("image")) t.push(...siteConfig.upload.allowedImageTypes);
                          if (acceptTypes.includes("video")) t.push(...siteConfig.upload.allowedVideoTypes);
                          if (acceptTypes.includes("audio")) t.push(...siteConfig.upload.allowedAudioTypes);
                          return t;
                        })();
                        const validFiles: File[] = [];
                        for (const file of Array.from(fileList)) {
                          if (file.size > maxBytes) {
                            setUploadError(t("assetPicker.uploadTooLarge", { maxSize: siteConfig.upload.maxFileSizeMB }));
                            e.currentTarget.value = "";
                            return;
                          }
                          if (!validTypes.includes(file.type)) {
                            setUploadError(t("assetPicker.uploadUnsupportedType"));
                            e.currentTarget.value = "";
                            return;
                          }
                          validFiles.push(file);
                        }
                        setUploadError(null);
                        onUpload(validFiles);
                        onClose();
                        e.currentTarget.value = "";
                      }}
                    />

                    <div className="rounded-xl border border-divider bg-default-50 p-4">
                      <div className="font-medium">
                        {t("assetPicker.uploadFromDevice")}
                      </div>
                      <div className="text-sm text-default-500 mt-1">
                        {t("assetPicker.uploadDescription", { maxSize: siteConfig.upload.maxFileSizeMB })}
                      </div>
                      {uploadError && (
                        <div className="text-xs text-danger mt-2">
                          {uploadError}
                        </div>
                      )}
                      <div className="mt-4 flex gap-2">
                        <Button
                          color="primary"
                          onPress={() => fileInputRef.current?.click()}
                        >
                          {t("assetPicker.chooseFile")}
                        </Button>
                        {!hideLibraryTab && (
                          <Button
                            variant="flat"
                            onPress={() => setTabKey("library")}
                          >
                            {t("assetPicker.browseLibrary")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Library Tab ── */
                  <div className="flex flex-row gap-0 min-h-0 flex-1">
                    <div className="hidden md:block w-[240px] shrink-0 border-r border-divider">
                      <AssetPickerUnifiedTree
                        projects={projects}
                        collections={collections}
                        selection={selection}
                        onSelect={(s) => setSelection(s)}
                        className="h-full py-1"
                      />
                    </div>

                    {mobileBrowserOpen && (
                      <div
                        className="md:hidden fixed inset-0 z-130 bg-black/50"
                        onClick={() => setMobileBrowserOpen(false)}
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 w-[80%] max-w-[320px] bg-background p-2 overflow-hidden flex flex-col"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-divider shrink-0">
                            <span className="text-sm font-medium">
                              {t("assetPicker.browse")}
                            </span>
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              onPress={() => setMobileBrowserOpen(false)}
                              aria-label={t("assetPicker.closeBrowser")}
                            >
                              <X size={16} />
                            </Button>
                          </div>
                          <AssetPickerUnifiedTree
                            projects={projects}
                            collections={collections}
                            selection={selection}
                            onSelect={(s) => {
                              setSelection(s);
                              setMobileBrowserOpen(false);
                            }}
                            className="flex-1 min-h-0 pt-1"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 md:pl-2">
                        {selection.kind === "folder" && selection.folderId && (
                          <div className="shrink-0 px-1">
                            <AssetPickerBreadcrumbs
                              collectionName={selectedCollectionName}
                              folderId={selection.folderId}
                              onNavigate={(id) => {
                                if (selection.kind !== "folder") return;
                                setSelection({
                                  kind: "folder",
                                  projectId: selection.projectId,
                                  collectionId: selection.collectionId,
                                  folderId: id,
                                  folderRoot: false,
                                });
                              }}
                            />
                          </div>
                        )}

                        {onCreateNew && (
                          <div className="shrink-0 px-1">
                            <Button
                              size="sm"
                              variant="flat"
                              color="primary"
                              startContent={<Plus size={14} />}
                              onPress={onCreateNew.onPress}
                            >
                              {onCreateNew.label}
                            </Button>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="flat"
                            className="md:hidden shrink-0"
                            startContent={<FolderTree size={14} />}
                            onPress={() => setMobileBrowserOpen(true)}
                          >
                            {t("assetPicker.browse")}
                          </Button>
                          <Input
                            startContent={
                              <Search size={16} className="text-default-400" />
                            }
                            placeholder={t("assetPicker.searchByTitle")}
                            value={query}
                            onValueChange={setQuery}
                            className="flex-1 min-w-[180px]"
                          />
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-default-500 mr-0.5">
                              {t("assetPicker.filterByRating")}:
                            </span>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                className="p-0.5 leading-none cursor-pointer"
                                onClick={() =>
                                  setFilterRating(filterRating === star ? null : star)
                                }
                              >
                                <Star
                                  size={16}
                                  className={
                                    filterRating !== null && star <= filterRating
                                      ? "text-yellow-400 fill-yellow-400"
                                      : "text-default-300"
                                  }
                                />
                              </button>
                            ))}
                            {filterRating !== null && (
                              <Button
                                size="sm"
                                variant="light"
                                isIconOnly
                                onPress={() => setFilterRating(null)}
                                className="min-w-6 w-6 h-6"
                              >
                                <X size={14} />
                              </Button>
                            )}
                          </div>
                        </div>

                        {loading ? (
                          <div className="flex items-center justify-center py-10">
                            <Spinner />
                          </div>
                        ) : filteredAssets.length === 0 ? (
                          <div className="text-center py-10 text-default-500">
                            {t("assetPicker.noAssetsFound")}
                          </div>
                        ) : (
                          <VirtualAssetGrid
                            assets={filteredAssets}
                            selectedIds={selectedIds}
                            multiSelect={multiSelect}
                            hasMore={hasMoreAssets}
                            isLoadingMore={loadingMoreAssets}
                            validateOnSelect={validateOnSelect}
                            onLoadMore={handleLoadMoreAssets}
                            onClick={handleAssetClick}
                            onExpand={setPreviewAsset}
                            untitledLabel={t("assetPicker.untitled")}
                            viewFullLabel={t("assetPicker.viewFull")}
                            assetAltLabel={t("assetPicker.assetAlt")}
                          />
                        )}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                {multiSelect && tabKey === "library" && selectedIds.size > 0 ? (
                  <>
                    <span className="text-sm text-default-500 mr-auto">
                      {t("assetPicker.selectedCount", { count: selectedIds.size })}
                      {maxSelectCount
                        ? ` / ${maxSelectCount}`
                        : ""}
                    </span>
                    <Button variant="light" onPress={onClose}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      color="primary"
                      onPress={() => handleConfirmSelection(onClose)}
                    >
                      {t("assetPicker.confirmSelection")}
                    </Button>
                  </>
                ) : (
                  <Button variant="light" onPress={onClose}>
                    {t("common.close")}
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Full image preview modal */}
      <Modal
        isOpen={!!previewAsset}
        onOpenChange={() => setPreviewAsset(null)}
        size="5xl"
        classNames={{
          wrapper: "z-[120]",
          base: "bg-black/95",
          closeButton: "text-white hover:bg-white/20",
        }}
      >
        <ModalContent>
          {(onPreviewClose) => (
            <>
              <ModalHeader className="text-white flex items-center justify-between">
                <span className="truncate pr-4">
                  {previewAsset?.generationDetails?.title ||
                    t("assetPicker.untitled")}
                </span>
              </ModalHeader>
              <ModalBody className="flex items-center justify-center p-4">
                {previewAsset && (
                  previewAsset.assetType === "element" && previewAsset.elementDetails ? (
                    <div className="w-full max-w-3xl text-white space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        {(previewAsset.elementDetails.imageUrls ?? []).map(
                          (url, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={url}
                              alt=""
                              className="w-full aspect-square object-cover rounded"
                            />
                          )
                        )}
                      </div>
                      {previewAsset.elementDetails.videoUrl && (
                        <video
                          src={previewAsset.elementDetails.videoUrl}
                          controls
                          muted
                          playsInline
                          className="w-full max-h-[40vh] object-contain rounded"
                        />
                      )}
                      {previewAsset.elementDetails.description && (
                        <p className="text-sm text-white/80 whitespace-pre-wrap">
                          {previewAsset.elementDetails.description}
                        </p>
                      )}
                      {previewAsset.elementDetails.voiceId && (
                        <p className="text-xs text-white/60 flex items-center gap-1">
                          <Music size={12} />
                          {previewAsset.elementDetails.voiceId}
                        </p>
                      )}
                    </div>
                  ) : previewAsset.assetType === "video" && previewAsset.videoUrl ? (
                    <video
                      src={previewAsset.videoUrl}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : previewAsset.assetType === "audio" && previewAsset.audioUrl ? (
                    <div className="w-full max-w-md mx-auto">
                      <AudioPlayer
                        src={previewAsset.audioUrl}
                        title={previewAsset.generationDetails?.title}
                        variant="full"
                        autoPlay
                      />
                    </div>
                  ) : (
                    <Image
                      src={previewAsset.imageUrl}
                      alt={
                        previewAsset.generationDetails?.title ||
                        t("assetPicker.assetAlt")
                      }
                      classNames={{
                        wrapper: "max-w-full max-h-[70vh]",
                        img: "max-w-full max-h-[70vh] object-contain",
                      }}
                    />
                  )
                )}
              </ModalBody>
              <ModalFooter className="justify-center gap-2">
                <Button
                  variant="flat"
                  className="text-white"
                  onPress={onPreviewClose}
                >
                  {t("common.close")}
                </Button>
                <Button
                  color="primary"
                  onPress={() => {
                    if (previewAsset) {
                      if (multiSelect) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(previewAsset.id)) {
                            next.delete(previewAsset.id);
                          } else {
                            if (maxSelectCountRef.current && next.size >= maxSelectCountRef.current) return prev;
                            next.add(previewAsset.id);
                          }
                          return next;
                        });
                        setPreviewAsset(null);
                      } else {
                        onSelectRef.current(previewAsset);
                        setPreviewAsset(null);
                        onOpenChangeRef.current();
                      }
                    }
                  }}
                >
                  {multiSelect
                    ? previewAsset && selectedIds.has(previewAsset.id)
                      ? t("assetPicker.deselectThisImage")
                      : t("assetPicker.selectThisImage")
                    : t("assetPicker.selectThisImage")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
