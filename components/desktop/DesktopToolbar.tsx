"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Kbd } from "@heroui/kbd";
import { Tooltip } from "@heroui/tooltip";
import { ZoomIn, ZoomOut, Maximize, Hand, MousePointer2 } from "lucide-react";
import type { CameraState } from "@/hooks/use-desktop";
import type { DesktopAsset } from "@/lib/db/schema";

export type CanvasMode = "move" | "select";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const DEFAULT_ASSET_WIDTH = 300;

interface DesktopToolbarProps {
  camera: CameraState;
  assets: DesktopAsset[];
  onCameraChange: (camera: CameraState) => void;
  canvasMode: CanvasMode;
  onCanvasModeChange: (mode: CanvasMode) => void;
}

export default function DesktopToolbar({
  camera,
  assets,
  onCameraChange,
  canvasMode,
  onCanvasModeChange,
}: DesktopToolbarProps) {
  const t = useTranslations("desktop");
  const toolbarRef = useRef<HTMLDivElement>(null);

  /** Get the actual canvas container dimensions (not the full window). */
  const getContainerSize = () => {
    const parent = toolbarRef.current?.parentElement;
    if (!parent) return { width: window.innerWidth, height: window.innerHeight };
    const rect = parent.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  /**
   * Zoom around the viewport center so assets don't shift unexpectedly.
   * Same math as the wheel-zoom handler in DesktopCanvas.
   */
  const zoomAroundCenter = (newZoom: number) => {
    const { width, height } = getContainerSize();
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = newZoom / camera.zoom;
    onCameraChange({
      x: centerX - (centerX - camera.x) * scale,
      y: centerY - (centerY - camera.y) * scale,
      zoom: newZoom,
    });
  };

  const zoomIn = () => {
    zoomAroundCenter(Math.min(MAX_ZOOM, camera.zoom * 1.25));
  };

  const zoomOut = () => {
    zoomAroundCenter(Math.max(MIN_ZOOM, camera.zoom / 1.25));
  };

  const fitToView = () => {
    const { width: vw, height: vh } = getContainerSize();

    if (assets.length === 0) {
      onCameraChange({ x: 0, y: 0, zoom: 1 });
      return;
    }

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const a of assets) {
      const w = a.width ?? DEFAULT_ASSET_WIDTH;
      const h = a.height ?? DEFAULT_ASSET_WIDTH;
      if (a.posX < minX) minX = a.posX;
      if (a.posY < minY) minY = a.posY;
      if (a.posX + w > maxX) maxX = a.posX + w;
      if (a.posY + h > maxY) maxY = a.posY + h;
    }

    const padding = 80;
    const bboxW = maxX - minX + padding * 2;
    const bboxH = maxY - minY + padding * 2;

    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(vw / bboxW, vh / bboxH))
    );

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    onCameraChange({
      x: vw / 2 - cx * zoom,
      y: vh / 2 - cy * zoom,
      zoom,
    });
  };

  const resetZoom = () => {
    zoomAroundCenter(1);
  };

  return (
    <div ref={toolbarRef} className="absolute bottom-4 right-4 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-xl border border-divider p-1 shadow-sm z-10">
      <Tooltip
        content={
          <div className="flex items-center gap-2">
            <span>
              {canvasMode === "move" ? t("moveModeTooltip") : t("selectModeTooltip")}
            </span>
            <Kbd>{canvasMode === "move" ? "H" : "V"}</Kbd>
          </div>
        }
        closeDelay={0}
      >
        <Button
          isIconOnly
          size="sm"
          variant={canvasMode === "move" ? "flat" : "flat"}
          color={canvasMode === "select" ? "primary" : "default"}
          onPress={() => onCanvasModeChange(canvasMode === "move" ? "select" : "move")}
        >
          {canvasMode === "move" ? <Hand size={16} /> : <MousePointer2 size={16} />}
        </Button>
      </Tooltip>

      <div className="w-px h-5 bg-divider mx-0.5" />

      <Tooltip content={t("zoomOut")} closeDelay={0}>
        <Button isIconOnly size="sm" variant="light" onPress={zoomOut}>
          <ZoomOut size={16} />
        </Button>
      </Tooltip>

      <Tooltip content={t("resetZoom")} closeDelay={0}>
        <Button
          size="sm"
          variant="light"
          className="min-w-12 text-xs font-mono"
          onPress={resetZoom}
        >
          {Math.round(camera.zoom * 100)}%
        </Button>
      </Tooltip>

      <Tooltip content={t("zoomIn")} closeDelay={0}>
        <Button isIconOnly size="sm" variant="light" onPress={zoomIn}>
          <ZoomIn size={16} />
        </Button>
      </Tooltip>

      <div className="w-px h-5 bg-divider mx-0.5" />

      <Tooltip content={t("fitToView")} closeDelay={0}>
        <Button isIconOnly size="sm" variant="light" onPress={fitToView}>
          <Maximize size={16} />
        </Button>
      </Tooltip>
    </div>
  );
}
