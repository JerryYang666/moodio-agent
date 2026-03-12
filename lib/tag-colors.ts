/**
 * Preset color options for collection tags.
 * Each color maps to a Tailwind background + text class pair for the chip.
 */
export interface TagColorOption {
  key: string;
  bg: string;
  text: string;
  /** Visible dot / swatch color for the picker */
  dot: string;
}

export const TAG_COLORS: TagColorOption[] = [
  { key: "red", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", dot: "#ef4444" },
  { key: "orange", bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", dot: "#f97316" },
  { key: "amber", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", dot: "#f59e0b" },
  { key: "green", bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", dot: "#22c55e" },
  { key: "teal", bg: "bg-teal-100 dark:bg-teal-900/40", text: "text-teal-700 dark:text-teal-300", dot: "#14b8a6" },
  { key: "blue", bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", dot: "#3b82f6" },
  { key: "indigo", bg: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-300", dot: "#6366f1" },
  { key: "purple", bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", dot: "#a855f7" },
  { key: "pink", bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-700 dark:text-pink-300", dot: "#ec4899" },
  { key: "gray", bg: "bg-gray-100 dark:bg-gray-800/60", text: "text-gray-700 dark:text-gray-300", dot: "#6b7280" },
];

export const TAG_COLOR_MAP = new Map(TAG_COLORS.map((c) => [c.key, c]));

export function getTagColor(key: string): TagColorOption {
  return TAG_COLOR_MAP.get(key) ?? TAG_COLORS[TAG_COLORS.length - 1]; // fallback to gray
}
