"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import type { DesktopAsset } from "@/lib/db/schema";
import type { CameraState } from "@/hooks/use-desktop";
import type { RemoteCursor } from "@/hooks/use-desktop-ws";
import type { ImageAssetMeta, VideoAssetMeta } from "@/lib/desktop/types";
import {
  Trash2,
  Play,
  MessageSquare,
  FolderPlus,
  Copy,
  MousePointer2,
} from "lucide-react";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_SENSITIVITY = 0.001;
const DEFAULT_ASSET_WIDTH = 300;
const CULL_PADDING = 200;
const CURSOR_THROTTLE_MS = 40;

interface EnrichedDesktopAsset extends DesktopAsset {
  imageUrl?: string | null;
  videoUrl?: string | null;
}

interface DesktopCanvasProps {
  assets: EnrichedDesktopAsset[];
  camera: CameraState;
  permission: string;
  onCameraChange: (camera: CameraState) => void;
  onAssetMove: (assetId: string, posX: number, posY: number) => void;
  onAssetBatchMove?: (moves: Array<{ id: string; posX: number; posY: number }>) => void;
  onAssetDelete?: (assetId: string) => void;
  onAssetBatchDelete?: (assetIds: string[]) => void;
  onOpenChat?: (chatId: string) => void;
  onCopyToCollection?: (asset: EnrichedDesktopAsset) => void;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  remoteCursors?: RemoteCursor[];
  remoteSelections?: Map<string, { sessionId: string; userId: string; firstName: string }[]>;
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
  onCameraChange,
  onAssetMove,
  onAssetBatchMove,
  onAssetDelete,
  onAssetBatchDelete,
  onOpenChat,
  onCopyToCollection,
  sendEvent,
  remoteCursors,
  remoteSelections,
}: DesktopCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const cameraAtPanStart = useRef({ x: 0, y: 0 });

  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  // Track natural image dimensions for aspect-ratio sizing
  const [naturalDims, setNaturalDims] = useState<Map<string, { w: number; h: number }>>(
    () => new Map()
  );

  // Throttle ref for cursor and drag events
  const lastCursorSend = useRef(0);
  const lastDragSend = useRef(0);

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

  const canEdit = permission === "owner" || permission === "collaborator";

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
    (e: React.WheelEvent) => {
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setContextMenu(null);

      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-asset-card]")) return;

      // Shift+click on background = start marquee
      if (e.shiftKey) {
        const world = screenToWorld(e.clientX, e.clientY);
        marqueeStart.current = world;
        setMarquee({ startX: world.x, startY: world.y, endX: world.x, endY: world.y });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
    [camera, screenToWorld, selectedIds, sendEvent]
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
    [camera, onCameraChange, draggingAssetId, marquee, screenToWorld, sendEvent]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Finish marquee
      if (marqueeStart.current && marquee) {
        const minX = Math.min(marquee.startX, marquee.endX);
        const maxX = Math.max(marquee.startX, marquee.endX);
        const minY = Math.min(marquee.startY, marquee.endY);
        const maxY = Math.max(marquee.startY, marquee.endY);

        const selected = new Set<string>();
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

      // Finish asset drag
      if (draggingAssetId && dragPos) {
        containerRef.current?.releasePointerCapture(e.pointerId);
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
    [draggingAssetId, dragPos, onAssetMove, onAssetBatchMove, assets, selectedIds, marquee, sendEvent]
  );

  const handleAssetPointerDown = useCallback(
    (e: React.PointerEvent, asset: DesktopAsset) => {
      if (!canEdit) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault(); // prevent native image drag
      setContextMenu(null);

      // Shift+click toggles selection
      if (e.shiftKey) {
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
      className="relative w-full h-full overflow-hidden bg-default-100 cursor-grab active:cursor-grabbing select-none"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => sendEvent?.("cursor_leave", {})}
      onContextMenu={handleBackgroundContextMenu}
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
          const { w, h } = getAssetDimensions(asset, naturalDims.get(asset.id));
          const isDragging = draggingAssetId === asset.id;
          const isSelected = selectedIds.has(asset.id);
          const remoteSelectorsForAsset = remoteSelections?.get(asset.id);

          let posX: number, posY: number;
          if (isDragging && dragPos) {
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

          return (
            <div
              key={asset.id}
              data-asset-card
              draggable={false}
              className={`absolute group transition-shadow duration-150 rounded-xl overflow-hidden bg-background shadow-md hover:shadow-lg ${
                isSelected
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : remoteSelectorsForAsset?.length
                    ? "ring-offset-2 ring-offset-background"
                    : "border border-divider"
              } ${isDragging ? "opacity-80 shadow-xl" : ""}`}
              style={{
                left: posX,
                top: posY,
                width: w,
                height: h,
                zIndex: isDragging ? 9999 : asset.zIndex,
                cursor: canEdit ? "move" : "default",
                ...(remoteSelectorsForAsset?.length && !isSelected
                  ? {
                      boxShadow: `0 0 0 2px ${userIdToColor(remoteSelectorsForAsset[0].userId)}`,
                    }
                  : {}),
              }}
              onPointerDown={(e) => handleAssetPointerDown(e, asset)}
              onContextMenu={(e) => handleContextMenu(e, asset)}
            >
              <AssetCardContent
                asset={asset}
                onImageLoad={handleImageLoad}
              />
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
        >
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
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-danger-50 text-danger transition-colors text-left"
            onClick={handleDeleteSelected}
          >
            <Trash2 size={14} />
            Delete{selectedIds.size > 1 ? ` (${selectedIds.size})` : ""}
          </button>
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
  onImageLoad,
}: {
  asset: EnrichedDesktopAsset;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
}) {
  const meta = asset.metadata as Record<string, unknown>;

  if (asset.assetType === "image") {
    const imgMeta = meta as unknown as ImageAssetMeta;
    const src = asset.imageUrl;
    if (!src) return <div className="w-full h-full bg-default-200 animate-pulse" />;
    return (
      <>
        <img
          src={src}
          alt={imgMeta.title || "Image"}
          draggable={false}
          className="w-full h-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            onImageLoad(asset.id, img.naturalWidth, img.naturalHeight);
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1.5 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
          {imgMeta.title || imgMeta.prompt || "Untitled"}
        </div>
      </>
    );
  }

  if (asset.assetType === "video") {
    const vidMeta = meta as unknown as VideoAssetMeta;
    const src = asset.imageUrl;
    if (!src) return <div className="w-full h-full bg-default-200 animate-pulse" />;
    return (
      <>
        <img
          src={src}
          alt={vidMeta.title || "Video"}
          draggable={false}
          className="w-full h-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            onImageLoad(asset.id, img.naturalWidth, img.naturalHeight);
          }}
        />
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-black/70 text-white rounded-full p-1 flex items-center gap-1">
            <Play size={10} fill="white" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1.5 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
          {vidMeta.title || "Untitled video"}
        </div>
      </>
    );
  }

  if (asset.assetType === "text") {
    const textMeta = meta as { content?: string; fontSize?: number; color?: string };
    return (
      <div
        className="w-full h-full p-3 overflow-auto text-foreground bg-background"
        style={{ fontSize: textMeta.fontSize || 14, color: textMeta.color }}
      >
        {textMeta.content || ""}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-default-400 text-xs bg-background">
      {asset.assetType}
    </div>
  );
}
