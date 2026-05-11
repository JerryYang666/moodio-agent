"use client";

import { Slider } from "@heroui/slider";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

interface AngleControlsProps {
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  onHorizontalChange: (v: number) => void;
  onVerticalChange: (v: number) => void;
  onZoomChange: (v: number) => void;
  onReset: () => void;
  className?: string;
}

/**
 * Three-slider panel for the Qwen Multiple Angles edit flow. Shared by the
 * desktop in-canvas overlay and the chat image-edit modal so both surfaces
 * expose the same knobs and ranges.
 */
export default function AngleControls({
  horizontalAngle,
  verticalAngle,
  zoom,
  onHorizontalChange,
  onVerticalChange,
  onZoomChange,
  onReset,
  className,
}: AngleControlsProps) {
  const t = useTranslations("desktop.imageEdit");

  const handleSingle =
    (setter: (v: number) => void) => (val: number | number[]) => {
      const n = Array.isArray(val) ? val[0] : val;
      if (typeof n === "number") setter(n);
    };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <Slider
        label={t("anglesHorizontalLabel")}
        size="sm"
        step={1}
        minValue={0}
        maxValue={360}
        value={horizontalAngle}
        onChange={handleSingle(onHorizontalChange)}
        getValue={(v) => `${Array.isArray(v) ? v[0] : v}°`}
        classNames={{ label: "text-xs text-default-500" }}
      />
      <Slider
        label={t("anglesVerticalLabel")}
        size="sm"
        step={1}
        minValue={-30}
        maxValue={90}
        value={verticalAngle}
        onChange={handleSingle(onVerticalChange)}
        getValue={(v) => `${Array.isArray(v) ? v[0] : v}°`}
        classNames={{ label: "text-xs text-default-500" }}
      />
      <Slider
        label={t("anglesZoomLabel")}
        size="sm"
        step={0.1}
        minValue={0}
        maxValue={10}
        value={zoom}
        onChange={handleSingle(onZoomChange)}
        getValue={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          return Number(n).toFixed(1);
        }}
        classNames={{ label: "text-xs text-default-500" }}
      />
      <button
        type="button"
        onClick={onReset}
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-background border border-divider hover:bg-default-100 transition-colors"
      >
        <RotateCcw size={13} />
        {t("anglesReset")}
      </button>
    </div>
  );
}
