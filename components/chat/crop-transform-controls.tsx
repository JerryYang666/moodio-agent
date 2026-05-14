"use client";

import { useTranslations } from "next-intl";
import {
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  Undo2,
} from "lucide-react";
import { Slider } from "@heroui/slider";

interface CropTransformControlsProps {
  flipX: boolean;
  flipY: boolean;
  onToggleFlipX: () => void;
  onToggleFlipY: () => void;
  rotationFine: number;
  onRotationFineChange: (v: number) => void;
  onRotateLeft90: () => void;
  onRotateRight90: () => void;
  /** Sum of the 90° step and the fine slider, shown next to the slider. */
  rotationTotal: number;
  onReset: () => void;
  className?: string;
}

/**
 * Transform controls for the crop tool: horizontal/vertical flip toggles,
 * 90° rotate left/right buttons, a fine-tilt slider in [-45, +45]°, and a
 * reset button. Shared by the chat modal and the desktop in-canvas overlay
 * so behavior can't drift.
 */
export default function CropTransformControls({
  flipX,
  flipY,
  onToggleFlipX,
  onToggleFlipY,
  rotationFine,
  onRotationFineChange,
  onRotateLeft90,
  onRotateRight90,
  rotationTotal,
  onReset,
  className,
}: CropTransformControlsProps) {
  const t = useTranslations("desktop.imageEdit.cropTransform");

  const iconBtn =
    "flex items-center justify-center w-9 h-9 rounded-md border border-divider hover:bg-default-100 transition-colors";
  const toggleBtn = (active: boolean) =>
    `${iconBtn} ${active ? "bg-primary/15 text-primary border-primary/40" : "bg-background"}`;

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleFlipX}
          aria-label={t("flipHorizontal")}
          aria-pressed={flipX}
          title={t("flipHorizontal")}
          className={toggleBtn(flipX)}
        >
          <FlipHorizontal2 size={15} />
        </button>
        <button
          type="button"
          onClick={onToggleFlipY}
          aria-label={t("flipVertical")}
          aria-pressed={flipY}
          title={t("flipVertical")}
          className={toggleBtn(flipY)}
        >
          <FlipVertical2 size={15} />
        </button>
        <button
          type="button"
          onClick={onRotateLeft90}
          aria-label={t("rotateLeft")}
          title={t("rotateLeft")}
          className={iconBtn + " bg-background"}
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          onClick={onRotateRight90}
          aria-label={t("rotateRight")}
          title={t("rotateRight")}
          className={iconBtn + " bg-background"}
        >
          <RotateCw size={15} />
        </button>
        <button
          type="button"
          onClick={onReset}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-background border border-divider hover:bg-default-100 transition-colors"
        >
          <Undo2 size={13} />
          {t("reset")}
        </button>
      </div>
      <div>
        <Slider
          aria-label={t("tilt")}
          label={t("tilt")}
          value={rotationFine}
          onChange={(v) =>
            onRotationFineChange(Array.isArray(v) ? v[0] : (v as number))
          }
          minValue={-45}
          maxValue={45}
          step={1}
          size="sm"
          color="primary"
          marks={[{ value: 0, label: "0°" }]}
          renderValue={() => (
            <span className="text-xs tabular-nums text-default-500">
              {Math.round(rotationTotal)}°
            </span>
          )}
        />
      </div>
    </div>
  );
}
