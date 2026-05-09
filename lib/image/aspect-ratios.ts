export const NANO_BANANA_SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type NanoBananaAspectRatio =
  (typeof NANO_BANANA_SUPPORTED_ASPECT_RATIOS)[number];

export const UI_IMAGE_ASPECT_RATIOS: readonly NanoBananaAspectRatio[] =
  NANO_BANANA_SUPPORTED_ASPECT_RATIOS;

