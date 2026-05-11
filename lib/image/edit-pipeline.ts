/**
 * Shared, UI-agnostic helpers for the image-edit flow used by both the
 * desktop in-canvas overlay and the chat modal. Keeping these here means
 * the two surfaces can never drift on e.g. how crop rects are scaled, how
 * marks are composited, or how the API body is built.
 */

import { uploadImage as uploadImageClient } from "@/lib/upload/client";
import {
  MARK_COMPOSITE_ALPHA,
  markColorNameFromHex,
  type MarkColorName,
} from "@/lib/image/mark-config";
import {
  snapToSupportedAspectRatio,
  type SupportedAspectRatio,
} from "@/lib/image/aspect-ratio";
import type { PixelCrop } from "react-image-crop";

export type ImageEditMode =
  | "redraw"
  | "crop"
  | "erase"
  | "cutout"
  | "angles";
export type CutoutSubMode = "auto" | "manual";
export type ImageEditOperation =
  | "redraw"
  | "erase"
  | "cutout-auto"
  | "cutout-manual"
  | "angles";

/**
 * Curated aspect ratio options shown to the user. Matches
 * SUPPORTED_ASPECT_RATIOS on the server but excludes extreme/niche values
 * (1:4, 1:8, 4:1, 8:1, 4:5, 5:4, 21:9) that add noise to the picker.
 */
export const ASPECT_RATIO_OPTIONS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
] as const satisfies readonly SupportedAspectRatio[];

export type AspectRatioChoice = "source" | (typeof ASPECT_RATIO_OPTIONS)[number];

export const DEFAULT_ASPECT_RATIO_CHOICE: AspectRatioChoice = "source";

/**
 * Resolve the aspect ratio to send to the edit endpoint. "source" snaps the
 * image's natural dimensions to the closest supported ratio (preserves
 * shape); an explicit choice is passed through as-is. Returns undefined if
 * no reasonable value can be produced — the server falls back to "auto".
 */
export function resolveAspectRatio(
  choice: AspectRatioChoice,
  naturalWidth: number,
  naturalHeight: number
): SupportedAspectRatio | undefined {
  if (choice === "source") {
    return snapToSupportedAspectRatio(naturalWidth, naturalHeight) ?? undefined;
  }
  return choice;
}

export function resolveOperation(
  mode: ImageEditMode,
  cutoutSub: CutoutSubMode
): ImageEditOperation {
  if (mode === "redraw") return "redraw";
  if (mode === "erase") return "erase";
  if (mode === "angles") return "angles";
  return cutoutSub === "manual" ? "cutout-manual" : "cutout-auto";
}

/** editType string used for callbacks / history (keeps cutout-{sub} form). */
export function resolveEditType(
  mode: ImageEditMode,
  cutoutSub: CutoutSubMode
): string {
  return mode === "cutout" ? `cutout-${cutoutSub}` : mode;
}

/**
 * Fetch the ORIGINAL (non-thumbnail) image bytes through our proxy so the
 * export canvas isn't tainted by cross-origin bitmaps. Returns a decoded
 * HTMLImageElement at natural resolution.
 */
export async function fetchOriginalImage(
  sourceImageId: string
): Promise<HTMLImageElement> {
  const res = await fetch(
    `/api/image/proxy?imageId=${encodeURIComponent(sourceImageId)}`
  );
  if (!res.ok) throw new Error(`Failed to fetch original image: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
  } finally {
    // Caller no longer needs the blob URL once the image is decoded; revoke
    // immediately. The decoded HTMLImageElement keeps its own bitmap ref.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Composite the user's brush canvas on top of the original-resolution image
 * and return a PNG File ready for upload.
 */
export async function composeMarkedImage(args: {
  sourceImageId: string;
  brushCanvas: HTMLCanvasElement;
  displayedCanvasSize: { width: number; height: number };
}): Promise<File> {
  const { sourceImageId, brushCanvas, displayedCanvasSize } = args;
  if (!brushCanvas) throw new Error("Brush canvas not ready");
  const cleanImage = await fetchOriginalImage(sourceImageId);

  const out = document.createElement("canvas");
  out.width = cleanImage.naturalWidth;
  out.height = cleanImage.naturalHeight;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Failed to get output 2d context");
  ctx.drawImage(cleanImage, 0, 0);
  const scaleX = cleanImage.naturalWidth / displayedCanvasSize.width;
  const scaleY = cleanImage.naturalHeight / displayedCanvasSize.height;
  ctx.save();
  ctx.scale(scaleX, scaleY);
  ctx.globalAlpha = MARK_COMPOSITE_ALPHA;
  ctx.drawImage(brushCanvas, 0, 0);
  ctx.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
      1.0
    );
  });
  return new File([blob], `marked_${Date.now()}.png`, { type: "image/png" });
}

/**
 * Crop the original-resolution image using a completedCrop in displayed-pixel
 * space. `displayedRect` MUST be captured from the rendered <img> *before*
 * any state flip that unmounts it — falling back to natural dimensions
 * silently produces a broken crop anchored at top-left.
 */
export async function composeCroppedImage(args: {
  sourceImageId: string;
  completedCrop: PixelCrop;
  displayedRect: DOMRect | null;
}): Promise<File> {
  const { sourceImageId, completedCrop, displayedRect } = args;
  if (
    !completedCrop ||
    completedCrop.width === 0 ||
    completedCrop.height === 0
  ) {
    throw new Error("Please select a crop area");
  }
  const cleanImage = await fetchOriginalImage(sourceImageId);
  const dispW = displayedRect?.width || cleanImage.naturalWidth;
  const dispH = displayedRect?.height || cleanImage.naturalHeight;
  const sx = (completedCrop.x * cleanImage.naturalWidth) / dispW;
  const sy = (completedCrop.y * cleanImage.naturalHeight) / dispH;
  const sw = (completedCrop.width * cleanImage.naturalWidth) / dispW;
  const sh = (completedCrop.height * cleanImage.naturalHeight) / dispH;

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Failed to get output 2d context");
  ctx.drawImage(cleanImage, sx, sy, sw, sh, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
      1.0
    );
  });
  return new File([blob], `cropped_${Date.now()}.png`, { type: "image/png" });
}

/**
 * Upload the user's marked image so the server can reference it by id.
 * skipCollection keeps the intermediate out of the user's library.
 */
export async function uploadMarkedImage(file: File): Promise<string> {
  const upload = await uploadImageClient(file, { skipCollection: true });
  if (!upload.success) {
    throw new Error(upload.error.message || "Marked image upload failed");
  }
  return upload.data.imageId;
}

export interface EditResult {
  imageId: string;
  imageUrl: string;
}

/** POST /api/image/edit and unwrap the result. */
export async function callImageEditApi(body: {
  operation: ImageEditOperation;
  sourceImageId: string;
  markedImageId: string | undefined;
  prompt: string | undefined;
  modelId?: string;
  markColor: MarkColorName | undefined;
  aspectRatio: SupportedAspectRatio | undefined;
  /** Qwen Multiple Angles params — only sent/used when operation === "angles". */
  horizontalAngle?: number;
  verticalAngle?: number;
  zoom?: number;
}): Promise<EditResult> {
  const apiRes = await fetch("/api/image/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: body.modelId ?? "nano-banana-2-fast",
      ...body,
    }),
  });
  if (!apiRes.ok) {
    const data = await apiRes.json().catch(() => ({}));
    const code = data?.error || `HTTP ${apiRes.status}`;
    throw new Error(code);
  }
  const data = await apiRes.json();
  if (!data.imageId) throw new Error("No imageId in response");
  return { imageId: data.imageId, imageUrl: data.imageUrl };
}

/** Upload a cropped file and return the server-side image id + url. */
export async function uploadCroppedImage(file: File): Promise<EditResult> {
  const upload = await uploadImageClient(file);
  if (!upload.success) {
    throw new Error(upload.error.message || "Upload failed");
  }
  return { imageId: upload.data.imageId, imageUrl: upload.data.imageUrl };
}

export { markColorNameFromHex };
