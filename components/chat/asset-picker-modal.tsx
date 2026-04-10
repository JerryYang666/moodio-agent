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
import { Search, Expand, Camera, Star, X, Check, Video } from "lucide-react";
import { siteConfig } from "@/config/site";
import { useGetCollectionsQuery } from "@/lib/redux/services/next-api";
import AssetPickerFolderTree from "./asset-picker-folder-tree";
import AssetPickerBreadcrumbs from "./asset-picker-breadcrumbs";

export type AssetSummary = {
  id: string;
  projectId: string;
  collectionId: string | null;
  imageId: string;
  assetId?: string;
  imageUrl: string;
  videoUrl?: string;
  assetType?: "image" | "video" | "public_image" | "public_video";
  chatId: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error";
  };
  rating?: number | null;
  addedAt: Date;
};

type Project = {
  id: string;
  name: string;
  isDefault: boolean;
};

type AssetsPageResponse = {
  assets?: AssetSummary[];
  hasMore?: boolean;
  nextOffset?: number | null;
};

/** Memoized grid item – only re-renders when its own selection state or asset changes */
const AssetGridItem = React.memo(function AssetGridItem({
  asset,
  index,
  isSelected,
  multiSelect,
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
  onClick: (asset: AssetSummary, index: number, e: React.MouseEvent) => void;
  onExpand: (asset: AssetSummary) => void;
  untitledLabel: string;
  viewFullLabel: string;
  assetAltLabel: string;
}) {
  return (
    <div
      className={`group relative rounded-lg overflow-hidden border border-divider bg-default-100 ${multiSelect && isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
    >
      <div className="aspect-square relative">
        <button
          className="w-full h-full"
          onClick={(e) => onClick(asset, index, e)}
        >
          <Image
            src={asset.imageUrl}
            alt={asset.generationDetails?.title || assetAltLabel}
            radius="none"
            classNames={{
              wrapper: "w-full h-full !max-w-full",
              img: `w-full h-full object-cover ${multiSelect && isSelected ? "opacity-80" : ""}`,
            }}
          />
        </button>

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
  hideLibraryTab = false,
  multiSelect = false,
  maxSelectCount,
  acceptTypes,
}: {
  isOpen: boolean;
  onOpenChange: () => void;
  onSelect: (asset: AssetSummary) => void;
  /** Called with all selected assets when multiSelect is enabled and user confirms */
  onSelectMultiple?: (assets: AssetSummary[]) => void;
  onUpload: (files: File[]) => void;
  /** When true, only shows the upload tab (hides the library picker) */
  hideLibraryTab?: boolean;
  /** Enable multiselect mode in the library tab */
  multiSelect?: boolean;
  /** Max number of images that can be selected (multiSelect mode) */
  maxSelectCount?: number;
  /** When provided, only show assets of these types (and restrict upload accordingly) */
  acceptTypes?: ("image" | "video")[];
}) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const { data: collections = [] } = useGetCollectionsQuery();
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const [nextAssetsOffset, setNextAssetsOffset] = useState(0);
  const [loadingMoreAssets, setLoadingMoreAssets] = useState(false);
  const [projectId, setProjectId] = useState<string>("recent");
  const [collectionId, setCollectionId] = useState<string>("all");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderRoot, setFolderRoot] = useState(false);
  const [query, setQuery] = useState("");
  const [tabKey, setTabKey] = useState<"library" | "upload" | "camera">("library");
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

  // Video recording state
  const [cameraMode, setCameraMode] = useState<"photo" | "video">("photo");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const MAX_VIDEO_RECORDING_SECONDS = 15;

  useEffect(() => {
    if (!isOpen) {
      setPreviewAsset(null);
      setSelectedIds(new Set());
      lastClickedIndexRef.current = null;
      setFilterRating(null);
      setFolderId(null);
      setFolderRoot(false);
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
          setProjects(data.projects || []);
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

  const visibleCollections = useMemo(() => {
    const all = collections;
    if (projectId === "recent") return all;
    return all.filter((c) => c.projectId === projectId);
  }, [collections, projectId]);

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
        if (collectionId !== "all") {
          params.set("collectionId", collectionId);
          if (folderId) {
            params.set("folderId", folderId);
          } else if (folderRoot) {
            params.set("folderRoot", "true");
          }
        } else if (projectId !== "recent") {
          params.set("projectId", projectId);
        }
        const res = await fetch(`/api/assets?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as AssetsPageResponse;
        // Filter out audio assets — audio is not supported in chat contexts
        const incoming = (data.assets || []).filter(
          (a) => (a.assetType as string) !== "audio"
        );

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
    [collectionId, projectId, folderId, folderRoot]
  );

  useEffect(() => {
    if (!isOpen) return;
    setAssets([]);
    setHasMoreAssets(false);
    setNextAssetsOffset(0);
    setLoadingMoreAssets(false);
    void loadAssetsPage({ offset: 0, append: false });
  }, [isOpen, projectId, collectionId, folderId, folderRoot, loadAssetsPage]);

  const handleLoadMoreAssets = useCallback(() => {
    if (loading || loadingMoreAssets || !hasMoreAssets) return;
    void loadAssetsPage({ offset: nextAssetsOffset, append: true });
  }, [hasMoreAssets, loadAssetsPage, loading, loadingMoreAssets, nextAssetsOffset]);

  const filteredAssets = useMemo(() => {
    let result = assets;
    if (acceptTypes && acceptTypes.length > 0) {
      result = result.filter((a) => {
        const type = a.assetType || "image";
        const baseType = type.replace("public_", "") as "image" | "video";
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
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(t("assetPicker.cameraAccessDenied"));
      setCameraActive(false);
    }
  }, [t]);

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
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

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
  }, [t, stopCamera, recordedVideoUrl]);

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
        size="4xl"
        scrollBehavior="inside"
        classNames={{ base: "max-h-[90dvh]", wrapper: "z-[120]" }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-2">
                <div>{t("assetPicker.title")}</div>
                <Tabs
                  selectedKey={tabKey}
                  onSelectionChange={(k) => setTabKey(k as "library" | "upload" | "camera")}
                  size="sm"
                  variant="underlined"
                >
                  {!hideLibraryTab && (
                    <Tab key="library" title={t("assetPicker.libraryTab")} />
                  )}
                  <Tab key="upload" title={t("assetPicker.uploadTab")} />
                  <Tab key="camera" title={t("assetPicker.cameraTab")} />
                </Tabs>
              </ModalHeader>

              <ModalBody className="overflow-hidden">
                {tabKey === "camera" ? (
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
                  <div className="flex flex-col gap-3 min-h-0">
                    <div className="flex flex-col md:flex-row gap-3 shrink-0">
                      <Select
                        label={t("assetPicker.projectLabel")}
                        selectedKeys={[projectId]}
                        onChange={(e) => {
                          const next = e.target.value;
                          setProjectId(next);
                          setCollectionId("all");
                          setFolderId(null);
                          setFolderRoot(false);
                        }}
                        className="md:w-1/2"
                      >
                        <SelectItem key="recent">
                          {t("assetPicker.recent")}
                        </SelectItem>
                        <>
                          {projects.map((p) => (
                            <SelectItem key={p.id}>
                              {p.isDefault
                                ? `${p.name} (${t("assetPicker.defaultSuffix")})`
                                : p.name}
                            </SelectItem>
                          ))}
                        </>
                      </Select>

                      <Select
                        label={t("assetPicker.collectionLabel")}
                        selectedKeys={[collectionId]}
                        onChange={(e) => {
                          setCollectionId(e.target.value);
                          setFolderId(null);
                          setFolderRoot(false);
                        }}
                        className="md:w-1/2"
                      >
                        <SelectItem key="all">{t("assetPicker.all")}</SelectItem>
                        <>
                          {visibleCollections.map((c) => (
                            <SelectItem key={c.id}>
                              {c.isOwner
                                ? c.name
                                : `${c.name} (${t("assetPicker.sharedSuffix")})`}
                            </SelectItem>
                          ))}
                        </>
                      </Select>
                    </div>

                    <div className="flex flex-row gap-0 min-h-0 flex-1">
                      {collectionId !== "all" && (
                        <div className="hidden md:block">
                          <AssetPickerFolderTree
                            collectionId={collectionId}
                            selectedFolderId={folderId}
                            isCollectionRoot={folderRoot}
                            onSelectFolder={(id, isRoot) => {
                              setFolderId(id);
                              setFolderRoot(isRoot);
                            }}
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
                        {folderId && (
                          <div className="shrink-0 px-1">
                            <AssetPickerBreadcrumbs
                              collectionName={
                                visibleCollections.find((c) => c.id === collectionId)?.name ?? null
                              }
                              folderId={folderId}
                              onNavigate={(id) => {
                                setFolderId(id);
                                setFolderRoot(false);
                              }}
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 shrink-0">
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
                  previewAsset.assetType === "video" && previewAsset.videoUrl ? (
                    <video
                      src={previewAsset.videoUrl}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="max-w-full max-h-[70vh] object-contain"
                    />
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
