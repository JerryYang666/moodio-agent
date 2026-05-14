"use client";

import { Slider } from "@heroui/slider";
import { useTranslations } from "next-intl";
import {
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  Undo2,
} from "lucide-react";

interface CropTransformControlsProps {
  rotationFine: number;
  rotationTotal: number;
  flipX: boolean;
  flipY: boolean;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onFineChange: (deg: number) => void;
  onToggleFlipX: () => void;
  onToggleFlipY: () => void;
  onReset: () => void;
  className?: string;
}

/**
 * Free-transform controls for the crop tool: 90° rotation buttons, a fine
 * angle slider (-45..+45), horizontal / vertical flip toggles, and a reset
 * button. Same component is rendered in the chat modal and the desktop
 * in-canvas overlay so behavior can't drift.
 */
export default function CropTransformControls({
  rotationFine,
  rotationTotal,
  flipX,
  flipY,
  onRotateLeft,
  onRotateRight,
  onFineChange,
  onToggleFlipX,
  onToggleFlipY,
  onReset,
  className,
}: CropTransformControlsProps) {
  const t = useTranslations("desktop.imageEdit.cropTransform");

  const iconBtn =
    "flex items-center justify-center w-9 h-9 rounded-md border border-divider hover:bg-default-100 transition-colors";
  const toggleBtn = (active: boolean) =>
    `${iconBtn} ${active ? "bg-primary/15 text-primary border-primary/40" : "bg-background"}`;

  const handleFine = (val: number | number[]) => {
    const n = Array.isArray(val) ? val[0] : val;
    if (typeof n === "number") onFineChange(n);
  };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onRotateLeft}
          aria-label={t("rotateLeft")}
          title={t("rotateLeft")}
          className={`${iconBtn} bg-background`}
        >
          <RotateCcw size={15} />
        </button>
        <span className="text-xs text-default-500 tabular-nums">
          {Math.round(rotationTotal)}°
        </span>
        <button
          type="button"
          onClick={onRotateRight}
          aria-label={t("rotateRight")}
          title={t("rotateRight")}
          className={`${iconBtn} bg-background`}
        >
          <RotateCw size={15} />
        </button>
      </div>

      <Slider
        label={t("fineAngle")}
        size="sm"
        step={1}
        minValue={-45}
        maxValue={45}
        value={rotationFine}
        onChange={handleFine}
        getValue={(v) => `${Array.isArray(v) ? v[0] : v}°`}
        classNames={{ label: "text-xs text-default-500" }}
        aria-label={t("fineAngle")}
      />

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
          onClick={onReset}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-background border border-divider hover:bg-default-100 transition-colors"
        >
          <Undo2 size={13} />
          {t("reset")}
        </button>
      </div>

    </div>
  );
}
