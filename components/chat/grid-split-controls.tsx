"use client";

import { useTranslations } from "next-intl";
import { Grid3X3, Minus, Plus, Undo2 } from "lucide-react";

import {
  evenCuts,
  presetGrid,
  type GridPreset,
  type GridSplitConfig,
} from "@/hooks/use-image-edit";

interface GridSplitControlsProps {
  config: GridSplitConfig;
  onChange: (next: GridSplitConfig) => void;
  className?: string;
}

const PRESETS: GridPreset[] = [2, 3, 4, 5];
const MIN_TILES_PER_AXIS = 1;
const MAX_TILES_PER_AXIS = 8;

/**
 * Controls for the grid-split tool. Surfaces:
 *   - 2x2 / 3x3 / 4x4 / 5x5 presets that overwrite the cut positions.
 *   - Stepper for column count and row count (independent), each step
 *     re-distributes cuts evenly across the available range.
 *   - Reset returns to the default 3x3 preset.
 *
 * Once a preset/stepper is applied the user can drag individual cut handles
 * in the canvas overlay to shift them; those edits are preserved in the
 * config object passed back to the hook.
 */
export default function GridSplitControls({
  config,
  onChange,
  className,
}: GridSplitControlsProps) {
  const t = useTranslations("desktop.imageEdit.gridSplit");

  const cols = config.verticalCuts.length + 1;
  const rows = config.horizontalCuts.length + 1;

  const setCols = (next: number) => {
    const clamped = Math.max(MIN_TILES_PER_AXIS, Math.min(MAX_TILES_PER_AXIS, next));
    onChange({
      ...config,
      verticalCuts: evenCuts(clamped - 1),
    });
  };
  const setRows = (next: number) => {
    const clamped = Math.max(MIN_TILES_PER_AXIS, Math.min(MAX_TILES_PER_AXIS, next));
    onChange({
      ...config,
      horizontalCuts: evenCuts(clamped - 1),
    });
  };

  const tilesTotal = rows * cols;

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div>
        <div className="text-xs font-medium text-default-600 mb-1.5 flex items-center gap-1.5">
          <Grid3X3 size={13} />
          {t("presetLabel")}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {PRESETS.map((p) => {
            const isActive = rows === p && cols === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChange(presetGrid(p))}
                className={[
                  "px-2 py-1.5 text-xs rounded-md border transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-background border-divider hover:bg-default-100",
                ].join(" ")}
              >
                {p}×{p}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stepper
          label={t("columns")}
          value={cols}
          onChange={setCols}
          min={MIN_TILES_PER_AXIS}
          max={MAX_TILES_PER_AXIS}
        />
        <Stepper
          label={t("rows")}
          value={rows}
          onChange={setRows}
          min={MIN_TILES_PER_AXIS}
          max={MAX_TILES_PER_AXIS}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-default-500">
        <span>
          {t("tileCount", { count: tilesTotal })}
        </span>
        <button
          type="button"
          onClick={() => onChange(presetGrid(3))}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background border border-divider hover:bg-default-100 transition-colors"
        >
          <Undo2 size={11} />
          {t("reset")}
        </button>
      </div>
    </div>
  );
}

interface StepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
}

function Stepper({ label, value, onChange, min, max }: StepperProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-default-500">
        {label}
      </span>
      <div className="flex items-center rounded-md border border-divider bg-background">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          className="px-2 py-1 text-default-600 hover:bg-default-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-l-md"
          aria-label="Decrease"
        >
          <Minus size={12} />
        </button>
        <span className="flex-1 text-center text-sm tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="px-2 py-1 text-default-600 hover:bg-default-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-r-md"
          aria-label="Increase"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
