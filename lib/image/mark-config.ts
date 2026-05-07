/**
 * Shared configuration for the user-facing image-marking system used by
 * both the chat mark-to-edit modal and the desktop in-canvas image-edit
 * overlay. The user picks a color + brush width here; the same chosen
 * stroke is then composited onto the original image at a fixed alpha so
 * the underlying content stays visible to the model.
 */

export type MarkColorName = "red" | "blue" | "green" | "yellow" | "magenta";

export interface MarkColor {
  name: MarkColorName;
  /** Hex used by the canvas brush. */
  value: string;
  /** Human-readable label used for tooltips / aria. */
  label: string;
}

export const MARK_COLORS: readonly MarkColor[] = [
  { name: "red", value: "#FF0000", label: "Red" },
  { name: "blue", value: "#1E73FF", label: "Blue" },
  { name: "green", value: "#22C55E", label: "Green" },
  { name: "yellow", value: "#FACC15", label: "Yellow" },
  { name: "magenta", value: "#FF00FF", label: "Magenta" },
] as const;

export interface MarkWidth {
  value: number;
  label: "S" | "M" | "L" | "XL";
}

export const MARK_WIDTHS: readonly MarkWidth[] = [
  { value: 3, label: "S" },
  { value: 6, label: "M" },
  { value: 12, label: "L" },
  { value: 24, label: "XL" },
] as const;

export const DEFAULT_MARK_COLOR: MarkColor = MARK_COLORS[0]; // red
export const DEFAULT_MARK_WIDTH: MarkWidth = MARK_WIDTHS[1]; // M (6px)

/**
 * Alpha used when compositing the user's brush canvas onto the original
 * image at submit time. Keep this in one place so chat & desktop stay in
 * sync. Strokes are drawn on the brush canvas at full opacity (so the
 * mask shape is clean and overlapping strokes don't compound), then the
 * whole canvas is drawn once with this alpha — giving a uniform
 * translucent mark regardless of how the user painted.
 */
export const MARK_COMPOSITE_ALPHA = 0.45;

/** Map a hex value back to its declared color name. Falls back to red. */
export function markColorNameFromHex(hex: string): MarkColorName {
  const c = MARK_COLORS.find(
    (x) => x.value.toLowerCase() === hex.toLowerCase()
  );
  return c ? c.name : "red";
}
