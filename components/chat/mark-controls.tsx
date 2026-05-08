"use client";

import {
  MARK_COLORS,
  MARK_WIDTHS,
} from "@/lib/image/mark-config";

interface MarkControlsProps {
  color: string;
  width: number;
  onColorChange: (hex: string) => void;
  onWidthChange: (px: number) => void;
  /** Optional className applied to the outer container. */
  className?: string;
  /** Disable all interactions (e.g., during processing). */
  disabled?: boolean;
}

/**
 * Compact toolbar used by both the chat mark-to-edit modal and the
 * desktop image-edit overlay. Color swatches on the left, brush-width
 * dots on the right, with a thin divider between.
 */
export default function MarkControls({
  color,
  width,
  onColorChange,
  onWidthChange,
  className,
  disabled,
}: MarkControlsProps) {
  return (
    <div
      className={[
        // flex-wrap lets the brush-size group drop to its own row when the
        // available width can't fit colors + divider + sizes on a single line.
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-1.5 rounded-md bg-default-100 border border-divider",
        disabled ? "opacity-50 pointer-events-none" : "",
        className || "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5" role="group" aria-label="Brush color">
        {MARK_COLORS.map((c) => {
          const selected = c.value.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={c.value}
              type="button"
              aria-label={c.label}
              aria-pressed={selected}
              title={c.label}
              onClick={() => onColorChange(c.value)}
              className={[
                "w-5 h-5 rounded-full border-2 transition-all",
                selected
                  ? "border-foreground scale-110"
                  : "border-transparent hover:border-default-400",
              ].join(" ")}
              style={{ backgroundColor: c.value }}
            />
          );
        })}
      </div>
      <div className="w-px h-5 bg-divider" />
      <div className="flex items-center gap-1" role="group" aria-label="Brush size">
        {MARK_WIDTHS.map((w) => {
          const selected = w.value === width;
          // Cap the visual dot diameter so XL doesn't overflow the chip.
          const dotPx = Math.min(w.value, 18);
          return (
            <button
              key={w.value}
              type="button"
              aria-label={`${w.label} brush`}
              aria-pressed={selected}
              title={`${w.label} brush`}
              onClick={() => onWidthChange(w.value)}
              className={[
                "flex items-center justify-center w-7 h-7 rounded transition-colors",
                selected ? "bg-default-300" : "hover:bg-default-200",
              ].join(" ")}
            >
              <span
                className="rounded-full bg-foreground"
                style={{ width: dotPx, height: dotPx }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
