"use client";

import { useTranslations } from "next-intl";
import { FlipHorizontal2, FlipVertical2, Undo2 } from "lucide-react";

interface CropTransformControlsProps {
  flipX: boolean;
  flipY: boolean;
  onToggleFlipX: () => void;
  onToggleFlipY: () => void;
  onReset: () => void;
  className?: string;
}

/**
 * Transform controls for the crop tool: horizontal / vertical flip
 * toggles and a reset button. Shared by the chat modal and the desktop
 * in-canvas overlay so behavior can't drift.
 */
export default function CropTransformControls({
  flipX,
  flipY,
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

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
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
  );
}
