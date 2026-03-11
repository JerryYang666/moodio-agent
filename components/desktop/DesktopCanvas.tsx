"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import type { DesktopAsset } from "@/lib/db/schema";
import type { CameraState } from "@/hooks/use-desktop";
import type { RemoteCursor } from "@/hooks/use-desktop-ws";
import type { EnrichedDesktopAsset } from "./assets";
import { ImageAsset, VideoAsset, TextAsset, LinkAsset } from "./assets";
import TableAsset from "./assets/TableAsset";
import { hasWriteAccess, type Permission } from "@/lib/permissions";
import type { CanvasMode } from "./DesktopToolbar";
import { AI_IMAGE_DRAG_MIME } from "@/components/chat/asset-dnd";
import {
  Trash2,
  MessageSquare,
  FolderPlus,
  MousePointer2,
  SendHorizontal,
  Film,
} from "lucide-react";

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
  onAssetResize?: (assetId: string, width: number, height: number) => void;
  onOpenChat?: (chatId: string) => void;
  onAssetOpen?: (asset: EnrichedDesktopAsset) => void;
  onAssetClick?: (asset: EnrichedDesktopAsset) => void;
  playingAssetId?: string | null;
  onCopyToCollection?: (asset: EnrichedDesktopAsset) => void;
  onSendToTimeline?: (asset: EnrichedDesktopAsset) => void;
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
      chatId?: string | null;
    },
    position: { x: number; y: number }
  ) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  assetId: string | null;
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
  if (naturalDims) {
    const scale = DEFAULT_ASSET_WIDTH / naturalDims.w;
    return { w: DEFAULT_ASSET_WIDTH, h: naturalDims.h * scale };
  }
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
  onCopyToCollection,
  onSendToTimeline,
  sendEvent,
  remoteCursors,
  remoteSelections,
  currentUserId,
  cellLocks,
  onCellCommit,
  onExternalImageDrop,
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

  const canEdit = hasWriteAccess(permission);

  const handleImageLoad = useCallback(
    (assetId: string, naturalWidth: number, naturalHeight: number) => {
      setNaturalDims((prev) => {
        if (prev.has(assetId)) return prev;
        const next = new Map(prev);
        next.set(assetId, { w: naturalWidth, h: naturalHeight });
        return next;
      });
    },
    []
  );

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
    [camera, onCameraChange]
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
        chatId?: unknown;
      };
      if (typeof parsed.imageId !== "string" || typeof parsed.url !== "string") {
        return null;
      }
      return {
        imageId: parsed.imageId,
        url: parsed.url,
        title: typeof parsed.title === "string" ? parsed.title : undefined,
        prompt: typeof parsed.prompt === "string" ? parsed.prompt : undefined,
        status:
          parsed.status === "loading" ||
          parsed.status === "generated" ||
          parsed.status === "error"
            ? parsed.status
            : undefined,
        chatId:
          typeof parsed.chatId === "string" || parsed.chatId === null
            ? parsed.chatId
            : undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit || !onExternalImageDrop) return;
      if (Array.from(e.dataTransfer.types).includes(AI_IMAGE_DRAG_MIME)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    },
    [canEdit, onExternalImageDrop]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit || !onExternalImageDrop) return;
      const payload = parseAiImageDropPayload(e);
      if (!payload) return;
      e.preventDefault();
      e.stopPropagation();
      const world = screenToWorld(e.clientX, e.clientY);
      onExternalImageDrop(payload, world);
    },
    [canEdit, onExternalImageDrop, parseAiImageDropPayload, screenToWorld]
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

      // Finish resize
      if (resizingAssetId && resizeDims) {
        containerRef.current?.releasePointerCapture(e.pointerId);
        onAssetResize?.(resizingAssetId, resizeDims.w, resizeDims.h);
        if (resizeDims.posX !== resizeStartDims.current.posX || resizeDims.posY !== resizeStartDims.current.posY) {
          onAssetMove(resizingAssetId, resizeDims.posX, resizeDims.posY);
        }
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
      setContextMenu({ x: e.clientX, y: e.clientY, assetId: asset.id });
    },
    [selectedIds]
  );

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu(null);
  }, []);

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
          title: ((contextAsset.metadata as Record<string, unknown>)?.title as string) || "Image",
        }
      : null;

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
                className={`w-full h-full rounded-xl overflow-hidden bg-background shadow-md transition-shadow duration-150 hover:shadow-lg ${
                  isSelected
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : remoteSelectorsForAsset?.length
                      ? "ring-offset-2 ring-offset-background"
                      : "border border-divider"
                } ${isDragging ? "opacity-80 shadow-xl" : ""}`}
                style={
                  remoteSelectorsForAsset?.length && !isSelected
                    ? { boxShadow: `0 0 0 2px ${userIdToColor(remoteSelectorsForAsset[0].userId)}` }
                    : undefined
                }
              >
              <AssetCardContent
                asset={asset}
                playing={playingAssetId === asset.id}
                onPlayToggle={onAssetClick ? () => onAssetClick(asset) : undefined}
                onImageLoad={handleImageLoad}
                sendEvent={sendEvent}
                cellLocks={cellLocks}
                currentUserId={currentUserId}
                onCellCommit={onCellCommit}
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
                  className="absolute -top-5 left-1 text-[10px] font-medium px-1 rounded text-white whitespace-nowrap"
                  style={{ backgroundColor: userIdToColor(remoteSelectorsForAsset[0].userId) }}
                >
                  {remoteSelectorsForAsset.map((s) => s.firstName).join(", ")}
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
          {selectedIds.size > 1 ? (
            /* Multi-select context menu: only delete option */
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-danger-50 text-danger transition-colors text-left"
              onClick={handleDeleteSelected}
            >
              <Trash2 size={14} />
              Delete all {selectedIds.size} selected
            </button>
          ) : (
            /* Single-select context menu: full options */
            <>
              {contextChatId && onOpenChat && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                  onClick={() => {
                    onOpenChat(contextChatId as string);
                    setContextMenu(null);
                  }}
                >
                  <MessageSquare size={14} />
                  Open in Chat
                </button>
              )}
              {contextImageInfo?.imageId && contextImageInfo.url && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("moodio-asset-selected", {
                        detail: {
                          assetId: contextImageInfo.assetId,
                          imageId: contextImageInfo.imageId,
                          url: contextImageInfo.url,
                          title: contextImageInfo.title,
                        },
                      })
                    );
                    setContextMenu(null);
                  }}
                >
                  <SendHorizontal size={14} />
                  Send to Chat
                </button>
              )}
              {contextAsset && onCopyToCollection && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                  onClick={() => {
                    onCopyToCollection(contextAsset);
                    setContextMenu(null);
                  }}
                >
                  <FolderPlus size={14} />
                  Copy to Collection
                </button>
              )}
              {contextAsset?.assetType === "video" && onSendToTimeline && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                  onClick={() => {
                    onSendToTimeline(contextAsset);
                    setContextMenu(null);
                  }}
                >
                  <Film size={14} />
                  Send to Timeline
                </button>
              )}
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-danger-50 text-danger transition-colors text-left"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Selection count indicator */}
      {selectedIds.size > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium shadow z-10">
          {selectedIds.size} selected
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 bg-background/80 backdrop-blur-sm text-xs text-default-500 px-2 py-1 rounded-lg border border-divider">
        {Math.round(camera.zoom * 100)}%
      </div>
    </div>
  );
}

function AssetCardContent({
  asset,
  playing,
  onPlayToggle,
  onImageLoad,
  sendEvent,
  cellLocks,
  currentUserId,
  onCellCommit,
}: {
  asset: EnrichedDesktopAsset;
  playing?: boolean;
  onPlayToggle?: () => void;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  cellLocks?: Map<string, { userId: string; sessionId: string; firstName: string }>;
  currentUserId?: string;
  onCellCommit?: (assetId: string, rowId: string, colIndex: number, value: string) => void;
}) {
  switch (asset.assetType) {
    case "image":
      return <ImageAsset asset={asset} onImageLoad={onImageLoad} />;
    case "video":
      return <VideoAsset asset={asset} playing={playing} onPlayToggle={onPlayToggle} onImageLoad={onImageLoad} />;
    case "text":
      return <TextAsset asset={asset} />;
    case "link":
      return <LinkAsset asset={asset} />;
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
