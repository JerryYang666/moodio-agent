"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { DesktopAsset } from "@/lib/db/schema";
import type { CameraState } from "@/hooks/use-desktop";
import type { RemoteCursor } from "@/hooks/use-desktop-ws";
import type { EnrichedDesktopAsset } from "./assets";
import { aspectRatioDimensions } from "@/lib/desktop/types";
import { ImageAsset, VideoAsset, TextAsset, LinkAsset, VideoSuggestAsset, AudioAsset } from "./assets";
import PublicVideoAsset from "./assets/PublicVideoAsset";
import TableAsset from "./assets/TableAsset";
import { hasWriteAccess, type Permission } from "@/lib/permissions";
import { MAX_PENDING_IMAGES } from "@/components/chat/pending-image-types";
import type { CanvasMode } from "./DesktopToolbar";
import { AI_IMAGE_DRAG_MIME, AI_TEXT_DRAG_MIME, AI_SHOTLIST_DRAG_MIME, AI_VIDEO_SUGGEST_DRAG_MIME } from "@/components/chat/asset-dnd";
import {
  Trash2,
  MessageSquare,
  FolderPlus,
  MousePointer2,
  SendHorizontal,
  Film,
  Plus,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Pencil,
  Type,
  Upload,
  Paintbrush,
  Crop,
  Eraser,
  Scissors,
  Orbit,
  History,
} from "lucide-react";
import AssetHistoryPopover from "./assets/AssetHistoryPopover";
import ImageEditOverlay, {
  type ImageEditMode,
  type ImageEditPlacement,
} from "./image-edit-overlay";
import { motion, AnimatePresence } from "framer-motion";
import { addToast } from "@heroui/toast";
import { siteConfig } from "@/config/site";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_SENSITIVITY = 0.005;
const DEFAULT_ASSET_WIDTH = 300;
const MIN_ASSET_SIZE = 50;
const CULL_PADDING = 200;
const CURSOR_THROTTLE_MS = 40;

interface DesktopCanvasProps {
  assets: EnrichedDesktopAsset[];
  camera: CameraState;
  permission: Permission;
  canvasMode: CanvasMode;
  onCameraChange: (camera: CameraState) => void;
  onAssetMove: (assetId: string, posX: number, posY: number) => void;
  onAssetBatchMove?: (moves: Array<{ id: string; posX: number; posY: number }>) => void;
  onAssetDelete?: (assetId: string) => void;
  onAssetBatchDelete?: (assetIds: string[]) => void;
  onAssetResize?: (
    assetId: string,
    width: number,
    height: number,
    posX?: number,
    posY?: number
  ) => void;
  onOpenChat?: (chatId: string, messageTimestamp?: number) => void;
  onAssetOpen?: (asset: EnrichedDesktopAsset) => void;
  onAssetClick?: (asset: EnrichedDesktopAsset) => void;
  playingAssetId?: string | null;
  /**
   * Save one or more desktop assets into a collection / folder. Wired to
   * both the right-click menu ("Save to collection…") and the floating
   * action bar; the page opens a destination picker and then POSTs to
   * /api/desktop/[id]/assets/save-to-collection with these asset IDs.
   */
  onSaveToCollection?: (assetIds: string[]) => void;
  onSendToTimeline?: (asset: EnrichedDesktopAsset) => void;
  onZIndexChange?: (assetId: string, delta: number) => void;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  remoteCursors?: RemoteCursor[];
  remoteSelections?: Map<string, { sessionId: string; userId: string; firstName: string }[]>;
  currentUserId?: string;
  cellLocks?: Map<string, { userId: string; sessionId: string; firstName: string }>;
  onCellCommit?: (assetId: string, rowId: string, colIndex: number, value: string) => void;
  onExternalImageDrop?: (
    payload: {
      imageId: string;
      url: string;
      title?: string;
      prompt?: string;
      status?: "loading" | "generated" | "error";
      aspectRatio?: string;
      chatId?: string | null;
    },
    position: { x: number; y: number }
  ) => void;
  onExternalTextDrop?: (
    payload: { content: string; chatId?: string | null },
    position: { x: number; y: number }
  ) => void;
  onExternalShotlistDrop?: (
    payload: {
      title: string;
      columns: string[];
      rows: Array<{ id: string; cells: Array<{ value: string }> }>;
      chatId?: string | null;
    },
    position: { x: number; y: number }
  ) => void;
  textLocks?: Map<string, { userId: string; sessionId: string; firstName: string }>;
  onTextCommit?: (assetId: string, content: string) => void;
  onVideoSuggestCommit?: (assetId: string, updates: { title: string; videoIdea: string }) => void;
  onExternalVideoSuggestDrop?: (
    payload: {
      imageId: string;
      url: string;
      title: string;
      videoIdea: string;
      prompt?: string;
      aspectRatio?: string;
      chatId?: string | null;
    },
    position: { x: number; y: number }
  ) => void;
  onAddAssetAtPosition?: (worldPos: { x: number; y: number }) => void;
  onAddTextAtPosition?: (worldPos: { x: number; y: number }) => void;
  onAssetRename?: (assetId: string, newTitle: string) => void;
  /**
   * Called when external files (images/videos/audio) are dropped onto the
   * canvas from outside the browser. Receives the dropped files and the
   * world-space coordinates where the cursor was released.
   */
  onExternalFileDrop?: (files: File[], position: { x: number; y: number }) => void;
  /**
   * In-canvas image-edit overlay state. When non-null, an `<ImageEditOverlay>`
   * is rendered over the target asset and the floating action bar is hidden
   * (since the overlay's own panes take over).
   */
  imageEditState?: {
    assetId: string;
    mode: ImageEditMode;
  } | null;
  onImageEditCommit?: (args: {
    assetId: string;
    newImageId: string;
    newImageUrl: string;
    editType: string;
    placement: ImageEditPlacement;
  }) => void;
  onImageEditCancel?: () => void;
  /**
   * Desktop ID — used by in-canvas UI (e.g. edit-history popover) that needs
   * to make scoped API calls without threading the route param through every
   * sub-component.
   */
  desktopId?: string;
  /**
   * Restore a past image version for an image asset. Routed through the same
   * imagePatch flow as forward edits so Cmd/Ctrl+Z can walk back.
   */
  onImageHistoryRestore?: (args: {
    assetId: string;
    imageId: string;
    imageUrl: string;
  }) => void;
  /**
   * Fired when a user captures a frame from a paused video on the canvas.
   * The image has already been uploaded; the page creates a new image asset
   * positioned next to the source video.
   */
  onVideoFrameCaptured?: (args: {
    sourceAsset: EnrichedDesktopAsset;
    imageId: string;
    imageUrl: string;
    width: number;
    height: number;
  }) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  assetId: string | null;
  worldX: number;
  worldY: number;
}

function isAiImageStatus(
  value: unknown
): value is "loading" | "generated" | "error" {
  return value === "loading" || value === "generated" || value === "error";
}

/** Asset types the save-to-collection endpoint accepts. Text / link / table /
 * video_suggest aren't backed by persistable library assets. Videos still
 * generating (no `videoId`) can't be saved either — gate those at the call
 * site. */
const SAVABLE_ASSET_TYPES = new Set([
  "image",
  "video",
  "audio",
  "public_image",
  "public_video",
]);

function isSavableAsset(asset: DesktopAsset): boolean {
  if (!SAVABLE_ASSET_TYPES.has(asset.assetType)) return false;
  if (asset.assetType === "video") {
    const meta = asset.metadata as Record<string, unknown>;
    return typeof meta.videoId === "string" && !!meta.videoId;
  }
  return true;
}

function userIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function getAssetDimensions(
  asset: DesktopAsset,
  naturalDims?: { w: number; h: number }
) {
  if (asset.width != null && asset.height != null) {
    return { w: asset.width, h: asset.height };
  }
  if (asset.assetType === "table") {
    const meta = asset.metadata as Record<string, unknown>;
    const rows = Array.isArray(meta.rows) ? meta.rows : [];
    return { w: 700, h: 40 + rows.length * 36 + 40 };
  }
  if (asset.assetType === "text") {
    return { w: DEFAULT_ASSET_WIDTH, h: 200 };
  }
  if (asset.assetType === "video_suggest") {
    return { w: 340, h: 100 };
  }
  if (naturalDims) {
    const scale = DEFAULT_ASSET_WIDTH / naturalDims.w;
    return { w: DEFAULT_ASSET_WIDTH, h: naturalDims.h * scale };
  }
  const meta = asset.metadata as Record<string, unknown>;
  const arDims = aspectRatioDimensions(
    typeof meta?.aspectRatio === "string" ? meta.aspectRatio : undefined,
    DEFAULT_ASSET_WIDTH
  );
  if (arDims) return arDims;
  return { w: DEFAULT_ASSET_WIDTH, h: DEFAULT_ASSET_WIDTH };
}

export default function DesktopCanvas({
  assets,
  camera,
  permission,
  canvasMode,
  onCameraChange,
  onAssetMove,
  onAssetBatchMove,
  onAssetDelete,
  onAssetBatchDelete,
  onAssetResize,
  onOpenChat,
  onAssetClick,
  playingAssetId,
  onSaveToCollection,
  onSendToTimeline,
  onZIndexChange,
  sendEvent,
  remoteCursors,
  remoteSelections,
  currentUserId,
  cellLocks,
  onCellCommit,
  onExternalImageDrop,
  onExternalTextDrop,
  onExternalShotlistDrop,
  textLocks,
  onTextCommit,
  onVideoSuggestCommit,
  onExternalVideoSuggestDrop,
  onAddAssetAtPosition,
  onAddTextAtPosition,
  onAssetRename,
  onExternalFileDrop,
  imageEditState,
  onImageEditCommit,
  onImageEditCancel,
  desktopId,
  onImageHistoryRestore,
  onVideoFrameCaptured,
}: DesktopCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const cameraAtPanStart = useRef({ x: 0, y: 0 });

  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const assetPointerDownPos = useRef<{ x: number; y: number; assetId: string } | null>(null);

  // Track natural image dimensions for aspect-ratio sizing
  const [naturalDims, setNaturalDims] = useState<Map<string, { w: number; h: number }>>(
    () => new Map()
  );

  // Throttle ref for cursor and drag events
  const lastCursorSend = useRef(0);
  const lastDragSend = useRef(0);

  // Resize state
  const [resizingAssetId, setResizingAssetId] = useState<string | null>(null);
  const resizeStartDims = useRef<{ w: number; h: number; posX: number; posY: number }>({ w: 0, h: 0, posX: 0, posY: 0 });
  const resizeStartMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeHandle = useRef<string>("");
  const [resizeDims, setResizeDims] = useState<{ w: number; h: number; posX: number; posY: number } | null>(null);
  const lastResizeSend = useRef(0);

  // Rename state
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Track whether the user is dragging an external file over the canvas, so
  // we can show a drop-zone overlay scoped to the canvas (not the whole page).
  const [isDraggingExternalFile, setIsDraggingExternalFile] = useState(false);
  const externalDragCounter = useRef(0);

  const t = useTranslations("desktop");
  const tChat = useTranslations("chat");
  const canEdit = hasWriteAccess(permission);

  const handleImageLoad = useCallback(
    (assetId: string, naturalWidth: number, naturalHeight: number) => {
      setNaturalDims((prev) => {
        if (prev.has(assetId)) return prev;
        const next = new Map(prev);
        next.set(assetId, { w: naturalWidth, h: naturalHeight });
        return next;
      });
      const asset = assets.find((a) => a.id === assetId);
      if (asset && asset.width == null && asset.height == null && onAssetResize) {
        const meta = asset.metadata as Record<string, unknown>;
        const arDims = aspectRatioDimensions(
          typeof meta?.aspectRatio === "string" ? meta.aspectRatio : undefined,
          DEFAULT_ASSET_WIDTH
        );
        if (arDims) {
          onAssetResize(assetId, arDims.w, arDims.h);
        } else {
          const scale = DEFAULT_ASSET_WIDTH / naturalWidth;
          onAssetResize(assetId, DEFAULT_ASSET_WIDTH, Math.round(naturalHeight * scale));
        }
      }
    },
    [assets, onAssetResize]
  );

  const handleFocusAsset = useCallback(
    (
      asset: EnrichedDesktopAsset,
      padding?: {
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
      }
    ) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dims = getAssetDimensions(asset, naturalDims.get(asset.id));
      // The container's bounding rect already reflects whatever the
      // chat side-panel is doing (the canvas lives in a flex-1
      // container that shrinks when the panel opens), so this width
      // is the *actual* visible canvas width. Just subtract any
      // caller-supplied padding (e.g., space reserved for the
      // image-edit overlay's side panes) before computing zoom.
      const viewportW = rect.width;
      const viewportH = rect.height;
      const padLeft = padding?.left ?? 0;
      const padRight = padding?.right ?? 0;
      const padTop = padding?.top ?? 0;
      const padBottom = padding?.bottom ?? 0;
      const availableW = Math.max(100, viewportW - padLeft - padRight);
      const availableH = Math.max(100, viewportH - padTop - padBottom);
      // Without padding, fall back to the original 80%-of-viewport
      // breathing room. With explicit padding the caller has already
      // reserved space for surrounding UI, so a smaller breathing
      // factor (5% margin inside available) is enough.
      const fillFactor = padding ? 0.95 : 0.8;
      const zoom = Math.min(
        (availableW * fillFactor) / dims.w,
        (availableH * fillFactor) / dims.h,
        MAX_ZOOM
      );
      // Place the asset's center at the center of the available area
      // (offset from the viewport origin by the left/top padding) so
      // the reserved padding regions stay clear.
      const assetCenterX = asset.posX + dims.w / 2;
      const assetCenterY = asset.posY + dims.h / 2;
      onCameraChange({
        x: padLeft + availableW / 2 - assetCenterX * zoom,
        y: padTop + availableH / 2 - assetCenterY * zoom,
        zoom,
      });
    },
    [naturalDims, onCameraChange]
  );

  // Padding reserved when auto-focusing for an image-edit operation,
  // so the asset + the overlay's right pane (prompt / submit / etc.)
  // and bottom pane (mark controls + clear) all fit on screen.
  // Numbers track the overlay's `screenRect` math in
  // `components/desktop/image-edit-overlay.tsx`:
  //   right pane: 280px wide + 12px gap + ~28px outer margin → 320
  //   bottom pane: ~50px tall + 12px gap + ~28px outer margin → 90
  //   left/top: small breathing room
  const IMAGE_EDIT_FOCUS_PADDING = {
    left: 40,
    right: 320,
    top: 40,
    bottom: 90,
  } as const;

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, asset: DesktopAsset, handle: string) => {
      if (!canEdit) return;
      e.stopPropagation();
      e.preventDefault();
      const dims = getAssetDimensions(asset, naturalDims.get(asset.id));
      resizeStartDims.current = { w: dims.w, h: dims.h, posX: asset.posX, posY: asset.posY };
      resizeStartMouse.current = { x: e.clientX, y: e.clientY };
      resizeHandle.current = handle;
      setResizingAssetId(asset.id);
      setResizeDims({ w: dims.w, h: dims.h, posX: asset.posX, posY: asset.posY });
      containerRef.current?.setPointerCapture(e.pointerId);
    },
    [canEdit, naturalDims]
  );

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Marquee selection
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Image edit-history popover (opened via right-click menu on image assets)
  const [historyPopover, setHistoryPopover] = useState<{
    assetId: string;
    x: number;
    y: number;
  } | null>(null);

  const visibleAssets = useMemo(() => {
    if (!containerRef.current) return assets;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;

    const worldLeft = -camera.x / camera.zoom - CULL_PADDING / camera.zoom;
    const worldTop = -camera.y / camera.zoom - CULL_PADDING / camera.zoom;
    const worldRight = (vw - camera.x) / camera.zoom + CULL_PADDING / camera.zoom;
    const worldBottom = (vh - camera.y) / camera.zoom + CULL_PADDING / camera.zoom;

    return assets.filter((a) => {
      const { w, h } = getAssetDimensions(a, naturalDims.get(a.id));
      return (
        a.posX + w > worldLeft &&
        a.posX < worldRight &&
        a.posY + h > worldTop &&
        a.posY < worldBottom
      );
    });
  }, [assets, camera, naturalDims]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // While an image-edit overlay is open, let wheel events bubble to the
      // overlay's own scroll container (long-form panes like "angles" need
      // to scroll their sliders + prompt). Hijacking the wheel for canvas
      // zoom here fights the overlay's internal scrolling.
      if (imageEditState) return;
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * (1 + delta)));
      const scale = newZoom / camera.zoom;

      onCameraChange({
        x: mouseX - (mouseX - camera.x) * scale,
        y: mouseY - (mouseY - camera.y) * scale,
        zoom: newZoom,
      });
    },
    [camera, onCameraChange, imageEditState]
  );

  // Attach wheel listener with { passive: false } so preventDefault() works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - camera.x) / camera.zoom,
        y: (clientY - rect.top - camera.y) / camera.zoom,
      };
    },
    [camera]
  );

  const parseAiImageDropPayload = useCallback((e: React.DragEvent) => {
    try {
      const json = e.dataTransfer.getData(AI_IMAGE_DRAG_MIME);
      if (!json) return null;
      const parsed = JSON.parse(json) as {
        imageId?: unknown;
        url?: unknown;
        title?: unknown;
        prompt?: unknown;
        status?: unknown;
        aspectRatio?: unknown;
        chatId?: unknown;
      };
      if (typeof parsed.imageId !== "string" || typeof parsed.url !== "string") {
        return null;
      }
      const status = isAiImageStatus(parsed.status) ? parsed.status : undefined;
      return {
        imageId: parsed.imageId,
        url: parsed.url,
        title: typeof parsed.title === "string" ? parsed.title : undefined,
        prompt: typeof parsed.prompt === "string" ? parsed.prompt : undefined,
        status,
        aspectRatio: typeof parsed.aspectRatio === "string" ? parsed.aspectRatio : undefined,
        chatId:
          typeof parsed.chatId === "string" || parsed.chatId === null
            ? parsed.chatId
            : undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const parseAiTextDropPayload = useCallback((e: React.DragEvent) => {
    try {
      const json = e.dataTransfer.getData(AI_TEXT_DRAG_MIME);
      if (!json) return null;
      const parsed = JSON.parse(json) as { content?: unknown; chatId?: unknown };
      if (typeof parsed.content !== "string" || !parsed.content) return null;
      return {
        content: parsed.content,
        chatId: typeof parsed.chatId === "string" || parsed.chatId === null ? parsed.chatId : undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const parseAiVideoSuggestDropPayload = useCallback((e: React.DragEvent) => {
    try {
      const json = e.dataTransfer.getData(AI_VIDEO_SUGGEST_DRAG_MIME);
      if (!json) return null;
      const parsed = JSON.parse(json) as {
        imageId?: unknown;
        url?: unknown;
        title?: unknown;
        videoIdea?: unknown;
        prompt?: unknown;
        aspectRatio?: unknown;
        chatId?: unknown;
      };
      if (typeof parsed.imageId !== "string" || typeof parsed.url !== "string") return null;
      return {
        imageId: parsed.imageId,
        url: parsed.url,
        title: typeof parsed.title === "string" ? parsed.title : "",
        videoIdea: typeof parsed.videoIdea === "string" ? parsed.videoIdea : "",
        prompt: typeof parsed.prompt === "string" ? parsed.prompt : undefined,
        aspectRatio: typeof parsed.aspectRatio === "string" ? parsed.aspectRatio : undefined,
        chatId:
          typeof parsed.chatId === "string" || parsed.chatId === null
            ? parsed.chatId
            : undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const parseAiShotlistDropPayload = useCallback((e: React.DragEvent) => {
    try {
      const json = e.dataTransfer.getData(AI_SHOTLIST_DRAG_MIME);
      if (!json) return null;
      const parsed = JSON.parse(json) as {
        title?: unknown;
        columns?: unknown;
        rows?: unknown;
        chatId?: unknown;
      };
      if (typeof parsed.title !== "string" || !Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) {
        return null;
      }
      return {
        title: parsed.title,
        columns: parsed.columns as string[],
        rows: parsed.rows as Array<{ id: string; cells: Array<{ value: string }> }>,
        chatId: typeof parsed.chatId === "string" || parsed.chatId === null ? parsed.chatId : undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit) return;
      const types = Array.from(e.dataTransfer.types);
      if (
        (onExternalImageDrop && types.includes(AI_IMAGE_DRAG_MIME)) ||
        (onExternalTextDrop && types.includes(AI_TEXT_DRAG_MIME)) ||
        (onExternalShotlistDrop && types.includes(AI_SHOTLIST_DRAG_MIME)) ||
        (onExternalVideoSuggestDrop && types.includes(AI_VIDEO_SUGGEST_DRAG_MIME)) ||
        (onExternalFileDrop && types.includes("Files"))
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    },
    [canEdit, onExternalImageDrop, onExternalTextDrop, onExternalShotlistDrop, onExternalVideoSuggestDrop, onExternalFileDrop]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit || !onExternalFileDrop) return;
      const types = Array.from(e.dataTransfer.types);
      if (!types.includes("Files")) return;
      externalDragCounter.current++;
      if (externalDragCounter.current === 1) {
        setIsDraggingExternalFile(true);
      }
    },
    [canEdit, onExternalFileDrop]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit || !onExternalFileDrop) return;
      const types = Array.from(e.dataTransfer.types);
      if (!types.includes("Files")) return;
      externalDragCounter.current--;
      if (externalDragCounter.current <= 0) {
        externalDragCounter.current = 0;
        setIsDraggingExternalFile(false);
      }
    },
    [canEdit, onExternalFileDrop]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit) return;

      // Always reset the external-drag overlay state on drop regardless of
      // payload type, since dragLeave doesn't fire when the drop completes.
      externalDragCounter.current = 0;
      setIsDraggingExternalFile(false);

      const imagePayload = onExternalImageDrop ? parseAiImageDropPayload(e) : null;
      if (imagePayload) {
        e.preventDefault();
        e.stopPropagation();
        const world = screenToWorld(e.clientX, e.clientY);
        onExternalImageDrop!(imagePayload, world);
        return;
      }

      const textPayload = onExternalTextDrop ? parseAiTextDropPayload(e) : null;
      if (textPayload) {
        e.preventDefault();
        e.stopPropagation();
        const world = screenToWorld(e.clientX, e.clientY);
        onExternalTextDrop!(textPayload, world);
        return;
      }

      const shotlistPayload = onExternalShotlistDrop ? parseAiShotlistDropPayload(e) : null;
      if (shotlistPayload) {
        e.preventDefault();
        e.stopPropagation();
        const world = screenToWorld(e.clientX, e.clientY);
        onExternalShotlistDrop!(shotlistPayload, world);
        return;
      }

      const videoSuggestPayload = onExternalVideoSuggestDrop ? parseAiVideoSuggestDropPayload(e) : null;
      if (videoSuggestPayload) {
        e.preventDefault();
        e.stopPropagation();
        const world = screenToWorld(e.clientX, e.clientY);
        onExternalVideoSuggestDrop!(videoSuggestPayload, world);
        return;
      }

      // External files (e.g. images/videos/audio dragged from the OS). Pass
      // the raw file list through — the page-side handler filters unsupported
      // types and caps the batch so it can surface a single summary toast.
      if (onExternalFileDrop && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const world = screenToWorld(e.clientX, e.clientY);
        onExternalFileDrop(Array.from(e.dataTransfer.files), world);
        return;
      }
    },
    [canEdit, onExternalImageDrop, onExternalTextDrop, onExternalShotlistDrop, onExternalVideoSuggestDrop, onExternalFileDrop, parseAiImageDropPayload, parseAiTextDropPayload, parseAiShotlistDropPayload, parseAiVideoSuggestDropPayload, screenToWorld]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setContextMenu(null);

      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-asset-card]")) return;

      // In "select" mode or with Shift key: drag on background = start marquee
      if (canvasMode === "select" || e.shiftKey) {
        const world = screenToWorld(e.clientX, e.clientY);
        marqueeStart.current = world;
        setMarquee({ startX: world.x, startY: world.y, endX: world.x, endY: world.y });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        // Clear selection unless holding Ctrl/Cmd (additive marquee)
        if (!e.ctrlKey && !e.metaKey) {
          Array.from(selectedIds).forEach((id) => {
            sendEvent?.("asset_deselected", { assetId: id });
          });
          setSelectedIds(new Set());
        }
        return;
      }

      // Click on background clears selection
      Array.from(selectedIds).forEach((id) => {
        sendEvent?.("asset_deselected", { assetId: id });
      });
      setSelectedIds(new Set());

      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      cameraAtPanStart.current = { x: camera.x, y: camera.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [camera, screenToWorld, selectedIds, sendEvent, canvasMode]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Marquee drag
      if (marqueeStart.current && marquee) {
        const world = screenToWorld(e.clientX, e.clientY);
        setMarquee((prev) =>
          prev ? { ...prev, endX: world.x, endY: world.y } : null
        );
        return;
      }

      // Resize drag
      if (resizingAssetId && resizeDims) {
        const dx = (e.clientX - resizeStartMouse.current.x) / camera.zoom;
        const dy = (e.clientY - resizeStartMouse.current.y) / camera.zoom;
        const start = resizeStartDims.current;
        const handle = resizeHandle.current;
        const aspect = start.w / start.h;

        let newW = start.w;
        let newH = start.h;
        let newPosX = start.posX;
        let newPosY = start.posY;

        if (handle === "se") {
          newW = Math.max(MIN_ASSET_SIZE, start.w + dx);
          newH = newW / aspect;
        } else if (handle === "sw") {
          newW = Math.max(MIN_ASSET_SIZE, start.w - dx);
          newH = newW / aspect;
          newPosX = start.posX + (start.w - newW);
        } else if (handle === "ne") {
          newW = Math.max(MIN_ASSET_SIZE, start.w + dx);
          newH = newW / aspect;
          newPosY = start.posY + (start.h - newH);
        } else if (handle === "nw") {
          newW = Math.max(MIN_ASSET_SIZE, start.w - dx);
          newH = newW / aspect;
          newPosX = start.posX + (start.w - newW);
          newPosY = start.posY + (start.h - newH);
        } else if (handle === "e") {
          newW = Math.max(MIN_ASSET_SIZE, start.w + dx);
        } else if (handle === "w") {
          newW = Math.max(MIN_ASSET_SIZE, start.w - dx);
          newPosX = start.posX + (start.w - newW);
        } else if (handle === "s") {
          newH = Math.max(MIN_ASSET_SIZE, start.h + dy);
        } else if (handle === "n") {
          newH = Math.max(MIN_ASSET_SIZE, start.h - dy);
          newPosY = start.posY + (start.h - newH);
        }

        setResizeDims({ w: newW, h: newH, posX: newPosX, posY: newPosY });

        const now = Date.now();
        if (sendEvent && now - lastResizeSend.current >= CURSOR_THROTTLE_MS) {
          lastResizeSend.current = now;
          sendEvent("asset_resizing", { assetId: resizingAssetId, width: newW, height: newH, posX: newPosX, posY: newPosY });
        }
        return;
      }

      // Asset drag
      if (draggingAssetId) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldX = (e.clientX - rect.left - camera.x) / camera.zoom - dragOffset.current.x;
        const worldY = (e.clientY - rect.top - camera.y) / camera.zoom - dragOffset.current.y;
        setDragPos({ x: worldX, y: worldY });

        const now = Date.now();
        if (sendEvent && now - lastDragSend.current >= CURSOR_THROTTLE_MS) {
          lastDragSend.current = now;
          sendEvent("asset_dragging", { assetId: draggingAssetId, posX: worldX, posY: worldY });
        }
        return;
      }

      if (!isPanning.current) {
        const now = Date.now();
        if (sendEvent && now - lastCursorSend.current >= CURSOR_THROTTLE_MS) {
          lastCursorSend.current = now;
          const world = screenToWorld(e.clientX, e.clientY);
          sendEvent("cursor_move", { x: world.x, y: world.y });
        }
        return;
      }
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      onCameraChange({
        ...camera,
        x: cameraAtPanStart.current.x + dx,
        y: cameraAtPanStart.current.y + dy,
      });
    },
    [camera, onCameraChange, draggingAssetId, resizingAssetId, resizeDims, marquee, screenToWorld, sendEvent]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Finish marquee
      if (marqueeStart.current && marquee) {
        const minX = Math.min(marquee.startX, marquee.endX);
        const maxX = Math.max(marquee.startX, marquee.endX);
        const minY = Math.min(marquee.startY, marquee.endY);
        const maxY = Math.max(marquee.startY, marquee.endY);

        // Start with existing selection if Ctrl/Cmd held (additive marquee)
        const selected = new Set<string>(
          (e.ctrlKey || e.metaKey) ? selectedIds : []
        );
        for (const a of assets) {
          const { w, h } = getAssetDimensions(a, naturalDims.get(a.id));
          if (
            a.posX + w > minX &&
            a.posX < maxX &&
            a.posY + h > minY &&
            a.posY < maxY
          ) {
            selected.add(a.id);
          }
        }

        selectedIds.forEach((id) => {
          if (!selected.has(id)) {
            sendEvent?.("asset_deselected", { assetId: id });
          }
        });
        selected.forEach((id) => {
          if (!selectedIds.has(id)) {
            sendEvent?.("asset_selected", { assetId: id });
          }
        });

        setSelectedIds(selected);
        marqueeStart.current = null;
        setMarquee(null);
        return;
      }

      // Finish resize. Always pass posX/posY: handles like nw/ne/sw/n/w
      // shift them to keep the opposite anchor steady, and the page handler
      // records a single history entry covering both axes.
      if (resizingAssetId && resizeDims) {
        containerRef.current?.releasePointerCapture(e.pointerId);
        onAssetResize?.(
          resizingAssetId,
          resizeDims.w,
          resizeDims.h,
          resizeDims.posX,
          resizeDims.posY
        );
        setResizingAssetId(null);
        setResizeDims(null);
        return;
      }

      // Finish asset drag
      if (draggingAssetId && dragPos) {
        containerRef.current?.releasePointerCapture(e.pointerId);

        // Detect click: if pointer barely moved, treat as click instead of drag
        const downPos = assetPointerDownPos.current;
        const dx = downPos ? Math.abs(e.clientX - downPos.x) : Infinity;
        const dy = downPos ? Math.abs(e.clientY - downPos.y) : Infinity;
        const isClick = dx < 5 && dy < 5;
        assetPointerDownPos.current = null;

        if (isClick) {
          const clickedAsset = assets.find((a) => a.id === draggingAssetId);
          if (clickedAsset && onAssetClick) {
            onAssetClick(clickedAsset);
          }
          setDraggingAssetId(null);
          setDragPos(null);
          return;
        }

        if (selectedIds.has(draggingAssetId) && selectedIds.size > 1) {
          const orig = assets.find((a) => a.id === draggingAssetId);
          if (orig && onAssetBatchMove) {
            const dx = dragPos.x - orig.posX;
            const dy = dragPos.y - orig.posY;
            const moves = Array.from(selectedIds).map((sid) => {
              const sa = assets.find((a) => a.id === sid);
              return {
                id: sid,
                posX: (sa?.posX ?? 0) + dx,
                posY: (sa?.posY ?? 0) + dy,
              };
            });
            onAssetBatchMove(moves);
          }
        } else {
          onAssetMove(draggingAssetId, dragPos.x, dragPos.y);
        }
        setDraggingAssetId(null);
        setDragPos(null);
        return;
      }
      isPanning.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [draggingAssetId, dragPos, onAssetMove, onAssetBatchMove, onAssetResize, onAssetClick, assets, selectedIds, marquee, sendEvent, resizingAssetId, resizeDims]
  );

  const handleAssetPointerDown = useCallback(
    (e: React.PointerEvent, asset: DesktopAsset) => {
      if (!canEdit) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault(); // prevent native image drag
      setContextMenu(null);

      // Shift+click or Ctrl/Cmd+click toggles selection
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(asset.id)) {
            next.delete(asset.id);
            sendEvent?.("asset_deselected", { assetId: asset.id });
          } else {
            next.add(asset.id);
            sendEvent?.("asset_selected", { assetId: asset.id });
          }
          return next;
        });
        return;
      }

      // If clicking unselected asset, replace selection
      if (!selectedIds.has(asset.id)) {
        // Deselect old ones
        Array.from(selectedIds).forEach((id) => {
          sendEvent?.("asset_deselected", { assetId: id });
        });
        setSelectedIds(new Set([asset.id]));
        sendEvent?.("asset_selected", { assetId: asset.id });
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const worldX = (e.clientX - rect.left - camera.x) / camera.zoom;
      const worldY = (e.clientY - rect.top - camera.y) / camera.zoom;
      dragOffset.current = { x: worldX - asset.posX, y: worldY - asset.posY };
      assetPointerDownPos.current = { x: e.clientX, y: e.clientY, assetId: asset.id };
      setDraggingAssetId(asset.id);
      setDragPos({ x: asset.posX, y: asset.posY });

      // Capture pointer on the container so we keep getting events even if
      // the cursor moves outside the asset card during the drag.
      containerRef.current?.setPointerCapture(e.pointerId);
    },
    [canEdit, camera, selectedIds, sendEvent]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, asset: DesktopAsset) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedIds.has(asset.id)) {
        setSelectedIds(new Set([asset.id]));
      }
      const world = screenToWorld(e.clientX, e.clientY);
      setContextMenu({ x: e.clientX, y: e.clientY, assetId: asset.id, worldX: world.x, worldY: world.y });
    },
    [selectedIds, screenToWorld]
  );

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!canEdit || !onAddAssetAtPosition) {
      setContextMenu(null);
      return;
    }
    const world = screenToWorld(e.clientX, e.clientY);
    setContextMenu({ x: e.clientX, y: e.clientY, assetId: null, worldX: world.x, worldY: world.y });
  }, [canEdit, onAddAssetAtPosition, screenToWorld]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (onAssetBatchDelete && selectedIds.size > 1) {
      onAssetBatchDelete(Array.from(selectedIds));
    } else if (onAssetDelete) {
      selectedIds.forEach((id) => {
        onAssetDelete(id);
      });
    }
    setSelectedIds(new Set());
    setContextMenu(null);
  }, [selectedIds, onAssetDelete, onAssetBatchDelete]);

  const startRename = useCallback(
    (asset: EnrichedDesktopAsset) => {
      const meta = asset.metadata as Record<string, unknown>;
      const currentTitle = (typeof meta.title === "string" ? meta.title : "") ||
        (typeof meta.prompt === "string" ? meta.prompt : "") || "";
      setRenameValue(currentTitle);
      setRenamingAssetId(asset.id);
      setContextMenu(null);
      // Focus the input after it renders
      setTimeout(() => renameInputRef.current?.focus(), 0);
    },
    []
  );

  const commitRename = useCallback(() => {
    if (renamingAssetId && onAssetRename && renameValue.trim()) {
      onAssetRename(renamingAssetId, renameValue.trim());
    }
    setRenamingAssetId(null);
    setRenameValue("");
  }, [renamingAssetId, renameValue, onAssetRename]);

  const cancelRename = useCallback(() => {
    setRenamingAssetId(null);
    setRenameValue("");
  }, []);

  const contextAsset = contextMenu?.assetId
    ? assets.find((a) => a.id === contextMenu.assetId)
    : null;
  const contextChatId =
    contextAsset &&
    typeof (contextAsset.metadata as Record<string, unknown>)?.chatId === "string"
      ? ((contextAsset.metadata as Record<string, unknown>).chatId as string)
      : null;

  const contextImageInfo =
    contextAsset?.assetType === "image"
      ? {
          assetId: contextAsset.id,
          imageId: (contextAsset.metadata as Record<string, unknown>)?.imageId as string | undefined,
          url: contextAsset.imageUrl,
          title: ((contextAsset.metadata as Record<string, unknown>)?.title as string) || t("imageTitle"),
        }
      : null;

  // Floating bar: compute info for the single selected asset
  const singleSelectedAsset = selectedIds.size === 1 && !draggingAssetId && !resizingAssetId
    ? assets.find((a) => selectedIds.has(a.id))
    : null;
  const floatingBarImageInfo = singleSelectedAsset?.assetType === "image"
    ? {
        assetId: singleSelectedAsset.id,
        imageId: (singleSelectedAsset.metadata as Record<string, unknown>)?.imageId as string | undefined,
        url: singleSelectedAsset.imageUrl,
        title: ((singleSelectedAsset.metadata as Record<string, unknown>)?.title as string) || t("imageTitle"),
      }
    : null;
  const floatingBarVideoInfo =
    singleSelectedAsset?.assetType === "video" || singleSelectedAsset?.assetType === "public_video"
      ? {
          assetId: singleSelectedAsset.id,
          videoId:
            singleSelectedAsset.assetType === "public_video"
              ? (((singleSelectedAsset.metadata as Record<string, unknown>)?.contentUuid as string) ||
                singleSelectedAsset.id)
              : (singleSelectedAsset as EnrichedDesktopAsset).generationData?.videoId ||
              ((singleSelectedAsset.metadata as Record<string, unknown>)?.videoId as string) ||
              singleSelectedAsset.id,
          url: (singleSelectedAsset as EnrichedDesktopAsset).videoUrl || "",
          title:
            ((singleSelectedAsset.metadata as Record<string, unknown>)?.title as string) ||
            t("videoTitle"),
          source:
            singleSelectedAsset.assetType === "public_video"
              ? ("retrieval" as const)
              : ("library" as const),
        }
      : null;
  const floatingBarVideoSuggestInfo = singleSelectedAsset?.assetType === "video_suggest"
    ? {
        assetId: singleSelectedAsset.id,
        imageId: (singleSelectedAsset.metadata as Record<string, unknown>)?.imageId as string | undefined,
        url: singleSelectedAsset.imageUrl,
        title: ((singleSelectedAsset.metadata as Record<string, unknown>)?.title as string) || "",
        videoIdea: ((singleSelectedAsset.metadata as Record<string, unknown>)?.videoIdea as string) || "",
      }
    : null;
  const floatingBarTextInfo = singleSelectedAsset?.assetType === "text"
    ? {
        assetId: singleSelectedAsset.id,
        content: ((singleSelectedAsset.metadata as Record<string, unknown>)?.content as string) || "",
      }
    : null;
  const floatingBarTableInfo = singleSelectedAsset?.assetType === "table"
    ? {
        assetId: singleSelectedAsset.id,
        meta: singleSelectedAsset.metadata as unknown as { title: string; columns: string[]; rows: Array<{ id: string; cells: Array<{ value: string }> }> },
      }
    : null;
  const floatingBarChatId = singleSelectedAsset &&
    typeof (singleSelectedAsset.metadata as Record<string, unknown>)?.chatId === "string"
    ? ((singleSelectedAsset.metadata as Record<string, unknown>).chatId as string)
    : null;
  const floatingBarMessageTimestamp = singleSelectedAsset
    ? ((singleSelectedAsset.metadata as Record<string, unknown>)?.messageTimestamp as number | undefined)
    : undefined;

  const worldStyle = {
    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
    transformOrigin: "0 0",
  };

  // Marquee rect in screen coords
  const marqueeScreen = useMemo(() => {
    if (!marquee || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const sx = marquee.startX * camera.zoom + camera.x + rect.left;
    const sy = marquee.startY * camera.zoom + camera.y + rect.top;
    const ex = marquee.endX * camera.zoom + camera.x + rect.left;
    const ey = marquee.endY * camera.zoom + camera.y + rect.top;
    return {
      left: Math.min(sx, ex) - rect.left,
      top: Math.min(sy, ey) - rect.top,
      width: Math.abs(ex - sx),
      height: Math.abs(ey - sy),
    };
  }, [marquee, camera]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-default-100 select-none ${
        canvasMode === "move"
          ? "cursor-grab active:cursor-grabbing"
          : "cursor-crosshair"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => sendEvent?.("cursor_leave", {})}
      onContextMenu={handleBackgroundContextMenu}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Dot grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `radial-gradient(circle, hsl(var(--heroui-default-400)) 1px, transparent 1px)`,
          backgroundSize: `${32 * camera.zoom}px ${32 * camera.zoom}px`,
          backgroundPosition: `${camera.x % (32 * camera.zoom)}px ${camera.y % (32 * camera.zoom)}px`,
        }}
      />

      {/* World container */}
      <div className="absolute top-0 left-0" style={worldStyle}>
        {visibleAssets.map((asset) => {
          const baseDims = getAssetDimensions(asset, naturalDims.get(asset.id));
          const isResizing = resizingAssetId === asset.id;
          const isDragging = draggingAssetId === asset.id;
          const isSelected = selectedIds.has(asset.id);
          const remoteSelectorsForAsset = remoteSelections?.get(asset.id);

          const w = isResizing && resizeDims ? resizeDims.w : baseDims.w;
          const h = isResizing && resizeDims ? resizeDims.h : baseDims.h;

          let posX: number, posY: number;
          if (isResizing && resizeDims) {
            posX = resizeDims.posX;
            posY = resizeDims.posY;
          } else if (isDragging && dragPos) {
            posX = dragPos.x;
            posY = dragPos.y;
          } else if (
            draggingAssetId &&
            isSelected &&
            selectedIds.has(draggingAssetId) &&
            dragPos
          ) {
            const orig = assets.find((a) => a.id === draggingAssetId);
            if (orig) {
              const dx = dragPos.x - orig.posX;
              const dy = dragPos.y - orig.posY;
              posX = asset.posX + dx;
              posY = asset.posY + dy;
            } else {
              posX = asset.posX;
              posY = asset.posY;
            }
          } else {
            posX = asset.posX;
            posY = asset.posY;
          }

          const handleSize = Math.max(8, 8 / camera.zoom);

          return (
            <div
              key={asset.id}
              data-asset-card
              draggable={false}
              className="absolute group"
              style={{
                left: posX,
                top: posY,
                width: w,
                height: h,
                zIndex: isDragging || isResizing ? 9999 : asset.zIndex,
                cursor: canEdit ? "move" : "default",
              }}
              onPointerDown={(e) => handleAssetPointerDown(e, asset)}
              onContextMenu={(e) => handleContextMenu(e, asset)}
            >
              <div
                className={`w-full h-full ${asset.assetType === "image" || asset.assetType === "video" || asset.assetType === "public_video" || asset.assetType === "public_image" ? "" : "rounded-xl"} overflow-hidden bg-background shadow-md transition-shadow duration-150 hover:shadow-lg ${
                  isSelected
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : remoteSelectorsForAsset?.length
                      ? "ring-offset-2 ring-offset-background"
                      : "border border-divider"
                } ${isDragging ? "opacity-80 shadow-xl" : ""}`}
                style={
                  remoteSelectorsForAsset?.length && !isSelected
                    ? { boxShadow: `0 0 0 ${2 / camera.zoom}px ${userIdToColor(remoteSelectorsForAsset[0].userId)}` }
                    : undefined
                }
              >
              <AssetCardContent
                asset={asset}
                containerWidth={w}
                playing={playingAssetId === asset.id}
                onPlayToggle={onAssetClick ? () => onAssetClick(asset) : undefined}
                onImageLoad={handleImageLoad}
                onFocusAsset={handleFocusAsset}
                zoom={camera.zoom}
                sendEvent={sendEvent}
                cellLocks={cellLocks}
                textLocks={textLocks}
                currentUserId={currentUserId}
                onCellCommit={onCellCommit}
                onTextCommit={onTextCommit}
                onVideoSuggestCommit={onVideoSuggestCommit}
                onVideoFrameCaptured={onVideoFrameCaptured}
              />
              </div>
              {/* Resize handles — visible when selected */}
              {canEdit && (isSelected || isResizing) && (
                <>
                  {(["nw", "ne", "sw", "se"] as const).map((corner) => {
                    const isTop = corner.startsWith("n");
                    const isLeft = corner.endsWith("w");
                    const cursorMap = { nw: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", se: "nwse-resize" } as const;
                    return (
                      <div
                        key={corner}
                        className="absolute z-10 bg-primary border-2 border-white rounded-sm shadow-sm"
                        style={{
                          width: handleSize,
                          height: handleSize,
                          top: isTop ? -handleSize / 2 : undefined,
                          bottom: isTop ? undefined : -handleSize / 2,
                          left: isLeft ? -handleSize / 2 : undefined,
                          right: isLeft ? undefined : -handleSize / 2,
                          cursor: cursorMap[corner],
                        }}
                        onPointerDown={(e) => handleResizePointerDown(e, asset, corner)}
                      />
                    );
                  })}
                  {(["n", "s", "e", "w"] as const).map((edge) => {
                    const isHorizontal = edge === "n" || edge === "s";
                    const cursorMap = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" } as const;
                    return (
                      <div
                        key={edge}
                        className="absolute z-10"
                        style={{
                          cursor: cursorMap[edge],
                          ...(isHorizontal
                            ? {
                                left: handleSize,
                                right: handleSize,
                                height: Math.max(6, 6 / camera.zoom),
                                ...(edge === "n" ? { top: -3 / camera.zoom } : { bottom: -3 / camera.zoom }),
                              }
                            : {
                                top: handleSize,
                                bottom: handleSize,
                                width: Math.max(6, 6 / camera.zoom),
                                ...(edge === "w" ? { left: -3 / camera.zoom } : { right: -3 / camera.zoom }),
                              }),
                        }}
                        onPointerDown={(e) => handleResizePointerDown(e, asset, edge)}
                      />
                    );
                  })}
                </>
              )}
              {remoteSelectorsForAsset?.length && !isSelected ? (
                <div
                  className="absolute left-0 pointer-events-none"
                  style={{
                    top: 0,
                    transform: `translateY(-100%) scale(${1 / camera.zoom})`,
                    transformOrigin: "bottom left",
                  }}
                >
                  <div
                    className="text-[10px] font-medium px-1 py-0.5 rounded text-white whitespace-nowrap"
                    style={{ backgroundColor: userIdToColor(remoteSelectorsForAsset[0].userId) }}
                  >
                    {remoteSelectorsForAsset.map((s) => s.firstName).join(", ")}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Remote cursors in world space */}
        {remoteCursors?.map((cursor) => {
          const color = userIdToColor(cursor.userId);
          return (
            <div
              key={cursor.sessionId}
              className="absolute pointer-events-none z-10000 transition-all duration-75"
              style={{
                left: cursor.x,
                top: cursor.y,
                transform: `translate(-1px, -1px) scale(${1 / camera.zoom})`,
              }}
            >
              <MousePointer2
                size={20}
                fill={color}
                color={color}
                strokeWidth={1.5}
              />
            </div>
          );
        })}
      </div>

      {/* Marquee selection rectangle */}
      {marqueeScreen && (
        <div
          className="absolute border-2 border-primary/50 bg-primary/10 pointer-events-none rounded"
          style={marqueeScreen}
        />
      )}

      {/* Context menu */}
      {contextMenu && canEdit && (
        <div
          className="fixed z-100 bg-background border border-divider rounded-xl shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {contextMenu.assetId === null ? (
            /* Background context menu: add asset / add text */
            <>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                onClick={() => {
                  onAddAssetAtPosition?.({ x: contextMenu.worldX, y: contextMenu.worldY });
                  setContextMenu(null);
                }}
              >
                <Plus size={14} />
                {t("addAsset")}
              </button>
              {onAddTextAtPosition && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                  onClick={() => {
                    onAddTextAtPosition({ x: contextMenu.worldX, y: contextMenu.worldY });
                    setContextMenu(null);
                  }}
                >
                  <Type size={14} />
                  {t("addText")}
                </button>
              )}
            </>
          ) : selectedIds.size > 1 ? (
            /* Multi-select context menu: save-to-collection + delete */
            <>
              {onSaveToCollection && (() => {
                const savableIds = Array.from(selectedIds).filter((id) => {
                  const a = assets.find((x) => x.id === id);
                  return a ? isSavableAsset(a) : false;
                });
                if (savableIds.length === 0) return null;
                return (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                    onClick={() => {
                      onSaveToCollection(savableIds);
                      setContextMenu(null);
                    }}
                  >
                    <FolderPlus size={14} />
                    {t("copyToCollection")}
                  </button>
                );
              })()}
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-danger-50 text-danger transition-colors text-left"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={14} />
                {t("deleteAllSelected", { count: selectedIds.size })}
              </button>
            </>
          ) : (
            /* Single-select context menu: z-index + delete */
            <>
              {contextAsset?.assetType === "image" &&
                Array.isArray(
                  (contextAsset.metadata as Record<string, unknown>)
                    .imageHistory
                ) &&
                ((contextAsset.metadata as Record<string, unknown>)
                  .imageHistory as unknown[]).length > 0 && (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                    onClick={() => {
                      if (!contextMenu) return;
                      setHistoryPopover({
                        assetId: contextAsset.id,
                        x: contextMenu.x,
                        y: contextMenu.y,
                      });
                      setContextMenu(null);
                    }}
                  >
                    <History size={14} />
                    {t("viewEditHistory")}
                  </button>
                )}
              {contextAsset && onAssetRename && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                  onClick={() => startRename(contextAsset as EnrichedDesktopAsset)}
                >
                  <Pencil size={14} />
                  {t("rename")}
                </button>
              )}
              {contextAsset && onSaveToCollection && isSavableAsset(contextAsset) && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                  onClick={() => {
                    onSaveToCollection([contextAsset.id]);
                    setContextMenu(null);
                  }}
                >
                  <FolderPlus size={14} />
                  {t("copyToCollection")}
                </button>
              )}
              {contextAsset && onZIndexChange && (
                <>
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                    onClick={() => {
                      onZIndexChange(contextAsset.id, 10);
                      setContextMenu(null);
                    }}
                  >
                    <ArrowUp size={14} />
                    {t("bringForward")}
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                    onClick={() => {
                      onZIndexChange(contextAsset.id, -10);
                      setContextMenu(null);
                    }}
                  >
                    <ArrowDown size={14} />
                    {t("sendBackward")}
                  </button>
                </>
              )}
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-danger-50 text-danger transition-colors text-left"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={14} />
                {t("delete")}
              </button>
            </>
          )}
        </div>
      )}

      {/* Image edit-history popover */}
      {historyPopover && desktopId && (
        <AssetHistoryPopover
          desktopId={desktopId}
          assetId={historyPopover.assetId}
          anchor={{ x: historyPopover.x, y: historyPopover.y }}
          canRestore={canEdit && !!onImageHistoryRestore}
          onClose={() => setHistoryPopover(null)}
          onRestore={({ imageId, imageUrl }) => {
            onImageHistoryRestore?.({
              assetId: historyPopover.assetId,
              imageId,
              imageUrl,
            });
          }}
        />
      )}

      {/* Inline rename input — appears below the asset being renamed */}
      {renamingAssetId && (() => {
        const renamingAsset = assets.find((a) => a.id === renamingAssetId);
        if (!renamingAsset) return null;
        const dims = getAssetDimensions(renamingAsset, naturalDims.get(renamingAsset.id));
        const screenX = renamingAsset.posX * camera.zoom + camera.x;
        const screenY = renamingAsset.posY * camera.zoom + camera.y;
        const screenW = dims.w * camera.zoom;
        const screenH = dims.h * camera.zoom;
        return (
          <div
            className="absolute z-60 flex items-center bg-background border border-divider rounded-lg shadow-lg px-2 py-1"
            style={{
              left: screenX + screenW / 2,
              top: screenY + screenH + 8,
              transform: "translate(-50%, 0)",
              minWidth: 200,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              ref={renameInputRef}
              className="flex-1 bg-transparent text-sm outline-none border-none px-1 py-0.5"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") cancelRename();
              }}
              onBlur={commitRename}
              placeholder={t("rename")}
            />
          </div>
        );
      })()}

      {/* Floating action bar — appears above the single selected asset.
          Hidden while the image-edit overlay is active so its own panes take over. */}
      {singleSelectedAsset && canEdit && !contextMenu && !imageEditState && (() => {
        const dims = getAssetDimensions(singleSelectedAsset, naturalDims.get(singleSelectedAsset.id));
        const screenX = singleSelectedAsset.posX * camera.zoom + camera.x;
        const screenY = singleSelectedAsset.posY * camera.zoom + camera.y;
        const screenW = dims.w * camera.zoom;
        return (
          <div
            className="absolute z-50 flex items-center gap-1 bg-background border border-divider rounded-lg shadow-lg px-1 py-1"
            style={{
              left: screenX + screenW / 2,
              top: screenY - 8,
              transform: "translate(-50%, -100%)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {floatingBarChatId && onOpenChat && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                onClick={() => onOpenChat(floatingBarChatId, floatingBarMessageTimestamp)}
                title={t("openInChat")}
              >
                <MessageSquare size={13} />
                {t("openInChat")}
              </button>
            )}
            {floatingBarImageInfo?.imageId && floatingBarImageInfo.url && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("moodio-asset-selected", {
                      detail: {
                        assetId: floatingBarImageInfo.assetId,
                        imageId: floatingBarImageInfo.imageId,
                        url: floatingBarImageInfo.url,
                        title: floatingBarImageInfo.title,
                      },
                    })
                  );
                }}
                title={t("sendToChat")}
              >
                <SendHorizontal size={13} />
                {t("sendToChat")}
              </button>
            )}
            {/* Image-editing operations: 重绘 / 裁切 / 擦除 / 抠图.
                Each button auto-focuses the asset (pan + zoom into view) then
                dispatches `moodio-image-edit` with the chosen mode, which the
                page-level listener turns into an inline editing overlay. */}
            {floatingBarImageInfo?.imageId &&
              floatingBarImageInfo.url &&
              ([
                { mode: "redraw" as const, Icon: Paintbrush, labelKey: "redraw" as const },
                { mode: "crop" as const, Icon: Crop, labelKey: "crop" as const },
                { mode: "erase" as const, Icon: Eraser, labelKey: "erase" as const },
                { mode: "cutout" as const, Icon: Scissors, labelKey: "cutout" as const },
                { mode: "angles" as const, Icon: Orbit, labelKey: "angles" as const },
              ]).map(({ mode, Icon, labelKey }) => (
                <button
                  key={mode}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                  onClick={() => {
                    if (singleSelectedAsset) {
                      // Reserve space for the overlay's right + bottom
                      // panes so they stay inside the visible canvas
                      // viewport (which already excludes the chat
                      // side-panel via the flex layout).
                      handleFocusAsset(
                        singleSelectedAsset,
                        IMAGE_EDIT_FOCUS_PADDING
                      );
                    }
                    window.dispatchEvent(
                      new CustomEvent("moodio-image-edit", {
                        detail: {
                          mode,
                          assetId: floatingBarImageInfo.assetId,
                          imageId: floatingBarImageInfo.imageId,
                          url: floatingBarImageInfo.url,
                          title: floatingBarImageInfo.title,
                        },
                      })
                    );
                  }}
                  title={t(labelKey)}
                >
                  <Icon size={13} />
                  {t(labelKey)}
                </button>
              ))}
            {floatingBarVideoInfo?.videoId && floatingBarVideoInfo.url && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("moodio-video-selected", {
                      detail: {
                        assetId: floatingBarVideoInfo.assetId,
                        videoId: floatingBarVideoInfo.videoId,
                        url: floatingBarVideoInfo.url,
                        title: floatingBarVideoInfo.title,
                        source: floatingBarVideoInfo.source,
                      },
                    })
                  );
                }}
                title={t("sendToChat")}
              >
                <SendHorizontal size={13} />
                {t("sendToChat")}
              </button>
            )}
            {floatingBarVideoSuggestInfo?.imageId && floatingBarVideoSuggestInfo.url && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("moodio-videosuggest-to-chat", {
                      detail: {
                        assetId: floatingBarVideoSuggestInfo.assetId,
                        imageId: floatingBarVideoSuggestInfo.imageId,
                        url: floatingBarVideoSuggestInfo.url,
                        title: floatingBarVideoSuggestInfo.title,
                        videoIdea: floatingBarVideoSuggestInfo.videoIdea,
                      },
                    })
                  );
                }}
                title={t("sendToChat")}
              >
                <SendHorizontal size={13} />
                {t("sendToChat")}
              </button>
            )}
            {floatingBarTextInfo?.content && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("moodio-batch-to-chat", {
                      detail: {
                        text: floatingBarTextInfo.content,
                      },
                    })
                  );
                }}
                title={t("sendToChat")}
              >
                <SendHorizontal size={13} />
                {t("sendToChat")}
              </button>
            )}
            {floatingBarTableInfo?.meta && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                onClick={() => {
                  const { meta } = floatingBarTableInfo;
                  const lines = meta.rows.map((row) =>
                    meta.columns.map((col, ci) => `${col}: ${row.cells[ci]?.value ?? ""}`).join(" | ")
                  );
                  const text = `[${meta.title || t("shotList")}]\n${lines.join("\n")}`;
                  window.dispatchEvent(
                    new CustomEvent("moodio-batch-to-chat", {
                      detail: { text },
                    })
                  );
                }}
                title={t("sendToChat")}
              >
                <SendHorizontal size={13} />
                {t("sendToChat")}
              </button>
            )}
            {singleSelectedAsset && onSaveToCollection && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                onClick={() => onSaveToCollection([singleSelectedAsset.id])}
                title={t("copyToCollection")}
              >
                <FolderPlus size={13} />
                {t("copyToCollection")}
              </button>
            )}
            {singleSelectedAsset.assetType === "video" && onSendToTimeline && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-default-100 rounded-md transition-colors whitespace-nowrap"
                onClick={() => onSendToTimeline(singleSelectedAsset)}
                title={t("sendToTimeline")}
              >
                <Film size={13} />
                {t("sendToTimeline")}
              </button>
            )}
          </div>
        );
      })()}

      {/* In-canvas image-edit overlay (重绘 / 裁切 / 擦除 / 抠图).
          Pinned to the asset's projected screen rect; surrounding panes float
          to the right of and below the asset. Mounted by page-level state
          set in response to a `moodio-image-edit` event. */}
      {imageEditState && canEdit && (() => {
        const target = assets.find((a) => a.id === imageEditState.assetId);
        if (!target || target.assetType !== "image") return null;
        const meta = target.metadata as Record<string, unknown>;
        const sourceImageId = typeof meta.imageId === "string" ? meta.imageId : null;
        const sourceImageUrl = target.imageUrl;
        if (!sourceImageId || !sourceImageUrl) return null;
        const dims = getAssetDimensions(target, naturalDims.get(target.id));
        const left = target.posX * camera.zoom + camera.x;
        const top = target.posY * camera.zoom + camera.y;
        const width = dims.w * camera.zoom;
        const height = dims.h * camera.zoom;
        return (
          <ImageEditOverlay
            mode={imageEditState.mode}
            assetId={target.id}
            sourceImageId={sourceImageId}
            sourceImageUrl={sourceImageUrl}
            screenRect={{ left, top, width, height }}
            onCommit={({ newImageId, newImageUrl, editType, placement }) =>
              onImageEditCommit?.({
                assetId: target.id,
                newImageId,
                newImageUrl,
                editType,
                placement,
              })
            }
            onCancel={() => onImageEditCancel?.()}
          />
        );
      })()}

      {/* Selection count indicator with batch send-to-chat */}
      {selectedIds.size > 1 && (() => {
        const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
        const allImageOrTextOrTable = selectedAssets.every(
          (a) => a.assetType === "image" || a.assetType === "text" || a.assetType === "table"
        );
        const imageAssets = selectedAssets.filter((a) => a.assetType === "image");
        const textAssets = selectedAssets.filter((a) => a.assetType === "text");
        const tableAssets = selectedAssets.filter((a) => a.assetType === "table");
        const canBatchSend = allImageOrTextOrTable && imageAssets.length <= MAX_PENDING_IMAGES;

        return (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium shadow z-10 flex items-center gap-2"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span>{t("selected", { count: selectedIds.size })}</span>
            {canBatchSend && (
              <button
                className="flex items-center gap-1 px-2 py-0.5 bg-primary-foreground/20 hover:bg-primary-foreground/30 rounded-full transition-colors whitespace-nowrap"
                onClick={() => {
                  const images = imageAssets
                    .filter((a) => a.imageUrl && (a.metadata as any)?.imageId)
                    .map((a) => ({
                      assetId: a.id,
                      imageId: (a.metadata as any).imageId as string,
                      url: a.imageUrl!,
                      title: (a.metadata as any)?.title || "",
                    }));

                  const textParts = textAssets
                    .map((a) => ((a.metadata as any)?.content as string) || "")
                    .filter(Boolean);

                  const tableParts = tableAssets.map((a) => {
                    const meta = a.metadata as any;
                    const cols = (meta.columns || []) as string[];
                    const rows = (meta.rows || []) as Array<{ id: string; cells: Array<{ value: string }> }>;
                    const lines = rows.map((row) =>
                      cols.map((col, ci) => `${col}: ${row.cells[ci]?.value ?? ""}`).join(" | ")
                    );
                    return `[${meta.title || t("shotList")}]\n${lines.join("\n")}`;
                  });

                  const text = [...textParts, ...tableParts].filter(Boolean).join("\n\n");

                  window.dispatchEvent(
                    new CustomEvent("moodio-batch-to-chat", {
                      detail: {
                        images: images.length > 0 ? images : undefined,
                        text: text || undefined,
                      },
                    })
                  );
                }}
              >
                <SendHorizontal size={11} />
                {t("sendAllToChat")}
              </button>
            )}
          </div>
        );
      })()}

      {/* External file drop overlay — scoped to the canvas. Mirrors the chat
          input's drop overlay, but the drop position determines the asset's
          world coordinates on the canvas. */}
      <AnimatePresence>
        {isDraggingExternalFile && onExternalFileDrop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-60 pointer-events-none"
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <div className="rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-md p-8 flex flex-col items-center gap-2 shadow-xl">
                <Upload size={36} className="text-primary" />
                <span className="text-lg font-semibold text-primary">
                  {tChat("dropZoneTitle")}
                </span>
                <span className="text-sm text-default-500">
                  {tChat("dropZoneSubtitle", { maxSize: siteConfig.upload.maxFileSizeMB })}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

function AssetCardContent({
  asset,
  containerWidth,
  playing,
  onPlayToggle,
  onImageLoad,
  onFocusAsset,
  zoom,
  sendEvent,
  cellLocks,
  textLocks,
  currentUserId,
  onCellCommit,
  onTextCommit,
  onVideoSuggestCommit,
  onVideoFrameCaptured,
}: {
  asset: EnrichedDesktopAsset;
  containerWidth: number;
  playing?: boolean;
  onPlayToggle?: () => void;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
  onFocusAsset?: (asset: EnrichedDesktopAsset) => void;
  zoom: number;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  cellLocks?: Map<string, { userId: string; sessionId: string; firstName: string }>;
  textLocks?: Map<string, { userId: string; sessionId: string; firstName: string }>;
  currentUserId?: string;
  onCellCommit?: (assetId: string, rowId: string, colIndex: number, value: string) => void;
  onTextCommit?: (assetId: string, content: string) => void;
  onVideoSuggestCommit?: (assetId: string, updates: { title: string; videoIdea: string }) => void;
  onVideoFrameCaptured?: (args: {
    sourceAsset: EnrichedDesktopAsset;
    imageId: string;
    imageUrl: string;
    width: number;
    height: number;
  }) => void;
}) {
  switch (asset.assetType) {
    case "image":
    case "public_image":
      return <ImageAsset asset={asset} containerWidth={containerWidth} onImageLoad={onImageLoad} onFocusAsset={onFocusAsset} zoom={zoom} />;
    case "video":
      return <VideoAsset asset={asset} containerWidth={containerWidth} playing={playing} onPlayToggle={onPlayToggle} onImageLoad={onImageLoad} onFocusAsset={onFocusAsset} zoom={zoom} onFrameCaptured={onVideoFrameCaptured} />;
    case "public_video":
      return <PublicVideoAsset asset={asset} playing={playing} onPlayToggle={onPlayToggle} onImageLoad={onImageLoad} onFocusAsset={onFocusAsset} zoom={zoom} />;
    case "text": {
      const textLock = textLocks?.get(asset.id);
      const isTextLockedByOther = !!textLock && textLock.userId !== currentUserId;
      return (
        <TextAsset
          asset={asset}
          sendEvent={sendEvent}
          currentUserId={currentUserId}
          isLockedByOther={isTextLockedByOther}
          lockInfo={isTextLockedByOther ? textLock : undefined}
          onTextCommit={onTextCommit}
        />
      );
    }
    case "link":
      return <LinkAsset asset={asset} />;
    case "video_suggest": {
      const vsLock = textLocks?.get(asset.id);
      const isVsLockedByOther = !!vsLock && vsLock.userId !== currentUserId;
      return (
        <VideoSuggestAsset
          asset={asset}
          onImageLoad={onImageLoad}
          onContentCommit={onVideoSuggestCommit}
          sendEvent={sendEvent}
          currentUserId={currentUserId}
          isLockedByOther={isVsLockedByOther}
          lockInfo={isVsLockedByOther ? vsLock : undefined}
        />
      );
    }
    case "audio":
      return <AudioAsset asset={asset} playing={playing} onPlayToggle={onPlayToggle} onFocusAsset={onFocusAsset} zoom={zoom} />;
    case "table": {
      const assetPrefix = `${asset.id}:`;
      const assetCellLocks = new Map<string, { userId: string; sessionId: string; firstName: string }>();
      if (cellLocks) {
        Array.from(cellLocks.entries()).forEach(([k, v]) => {
          if (k.startsWith(assetPrefix)) {
            assetCellLocks.set(k.slice(assetPrefix.length), v);
          }
        });
      }
      return <TableAsset asset={asset} sendEvent={sendEvent} cellLocks={assetCellLocks} currentUserId={currentUserId} onCellCommit={onCellCommit} />;
    }
    default:
      return (
        <div className="w-full h-full flex items-center justify-center text-default-400 text-xs bg-background">
          {asset.assetType}
        </div>
      );
  }
}
