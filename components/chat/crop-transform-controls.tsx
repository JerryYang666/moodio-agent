"use client";

import { Slider } from "@heroui/slider";
import { useTranslations } from "next-intl";
import { FlipHorizontal2, FlipVertical2, Undo2 } from "lucide-react";

interface CropTransformControlsProps {
  tilt: number;
  flipX: boolean;
  flipY: boolean;
  onTiltChange: (deg: number) => void;
  onToggleFlipX: () => void;
  onToggleFlipY: () => void;
  onReset: () => void;
  className?: string;
}

/**
 * Transform controls for the crop tool: a tilt slider (-45..+45) that
 * rotates the crop SELECTION around its center (the image stays still),
 * horizontal / vertical flip toggles for the image, and a reset button.
 * Same component is rendered by the chat modal and the desktop in-canvas
 * overlay so behavior can't drift.
 */
export default function CropTransformControls({
  tilt,
  flipX,
  flipY,
  onTiltChange,
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

  const handleTilt = (val: number | number[]) => {
    const n = Array.isArray(val) ? val[0] : val;
    if (typeof n === "number") onTiltChange(n);
  };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <Slider
        label={t("tilt")}
        size="sm"
        step={1}
        minValue={-45}
        maxValue={45}
        value={tilt}
        onChange={handleTilt}
        getValue={(v) => `${Array.isArray(v) ? v[0] : v}°`}
        classNames={{ label: "text-xs text-default-500" }}
        aria-label={t("tilt")}
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
