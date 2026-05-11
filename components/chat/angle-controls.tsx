"use client";

import type { CSSProperties } from "react";
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

const CUBE_SIZE = 72;
const HALF = CUBE_SIZE / 2;

// Six-face cube used as a rotation reference above the sliders. Each face
// shares the same size; translateZ pushes it out to the cube's surface.
const FACES: Array<{
  label: string;
  transform: string;
  bg: string;
}> = [
  { label: "F", transform: `translateZ(${HALF}px)`, bg: "bg-primary/80" },
  { label: "B", transform: `rotateY(180deg) translateZ(${HALF}px)`, bg: "bg-default-500/70" },
  { label: "R", transform: `rotateY(90deg) translateZ(${HALF}px)`, bg: "bg-default-400/70" },
  { label: "L", transform: `rotateY(-90deg) translateZ(${HALF}px)`, bg: "bg-default-300/70" },
  { label: "T", transform: `rotateX(90deg) translateZ(${HALF}px)`, bg: "bg-default-200/80" },
  { label: "Bt", transform: `rotateX(-90deg) translateZ(${HALF}px)`, bg: "bg-default-600/70" },
];

/**
 * Orientation-only reference cube. Rotates with horizontal/vertical angles
 * and scales with zoom so users can see how the camera framing maps to the
 * slider values. This is NOT a pixel-accurate preview of the model output —
 * just a mental-model aid. Front face is colored so "front-of-subject" is
 * always identifiable no matter how far the cube has tumbled.
 */
function CubePreview({
  horizontalAngle,
  verticalAngle,
  zoom,
}: {
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
}) {
  // zoom 0..10 (default 5) → scale 0.6..1.4 (default 1.0). Keeps the cube
  // inside its box at both extremes.
  const scale = 0.6 + (zoom / 10) * 0.8;
  const cubeStyle: CSSProperties = {
    width: CUBE_SIZE,
    height: CUBE_SIZE,
    transformStyle: "preserve-3d",
    // scale3d (not scale) so Z also scales — otherwise rotated faces flatten
    // along the viewing axis and the cube appears squeezed when zooming.
    transform: `translate(-50%, -50%) rotateX(${-verticalAngle}deg) rotateY(${-horizontalAngle}deg) scale3d(${scale}, ${scale}, ${scale})`,
    transition: "transform 80ms linear",
  };

  return (
    <div
      className="relative mx-auto"
      style={{ width: 140, height: 120, perspective: 500 }}
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-1/2" style={cubeStyle}>
        {FACES.map((face) => (
          <div
            key={face.label}
            className={`absolute inset-0 flex items-center justify-center text-[11px] font-semibold border border-divider/60 ${face.bg}`}
            style={{ transform: face.transform }}
          >
            {face.label}
          </div>
        ))}
      </div>
    </div>
  );
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
      <CubePreview
        horizontalAngle={horizontalAngle}
        verticalAngle={verticalAngle}
        zoom={zoom}
      />
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
