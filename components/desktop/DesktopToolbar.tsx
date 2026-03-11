"use client";

import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
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

  const zoomIn = () => {
    const newZoom = Math.min(MAX_ZOOM, camera.zoom * 1.25);
    onCameraChange({ ...camera, zoom: newZoom });
  };

  const zoomOut = () => {
    const newZoom = Math.max(MIN_ZOOM, camera.zoom / 1.25);
    onCameraChange({ ...camera, zoom: newZoom });
  };

  const fitToView = () => {
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

    const vw = window.innerWidth;
    const vh = window.innerHeight;
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
    onCameraChange({ ...camera, zoom: 1 });
  };

  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-xl border border-divider p-1 shadow-sm z-10">
      <Tooltip
        content={canvasMode === "move" ? t("moveModeTooltip") : t("selectModeTooltip")}
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
