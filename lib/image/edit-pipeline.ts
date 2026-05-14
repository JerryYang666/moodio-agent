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
  | "angles"
  | "split";
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
 * Aspect-ratio options shown specifically in the crop tool. Same curated
 * numeric set as the AI flow, plus a "free" option for unconstrained drag.
 * Kept separate from ASPECT_RATIO_OPTIONS because "free" maps to undefined
 * (no constraint) rather than a SupportedAspectRatio sent to the model.
 */
export const CROP_ASPECT_RATIO_OPTIONS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
] as const;

export type CropAspectChoice =
  | "free"
  | "source"
  | (typeof CROP_ASPECT_RATIO_OPTIONS)[number];

export const DEFAULT_CROP_ASPECT_CHOICE: CropAspectChoice = "free";

/**
 * Resolve a CropAspectChoice into the numeric `aspect` value that
 * <ReactCrop> consumes. Returns undefined for "free" (no constraint).
 */
export function resolveCropAspectRatio(
  choice: CropAspectChoice,
  naturalWidth: number,
  naturalHeight: number
): number | undefined {
  if (choice === "free") return undefined;
  if (choice === "source") {
    if (!naturalWidth || !naturalHeight) return undefined;
    return naturalWidth / naturalHeight;
  }
  const [w, h] = choice.split(":").map(Number);
  if (!w || !h) return undefined;
  return w / h;
}

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
 * space.
 *
 * `displayedRect` is the rendered crop wrapper's bounding box (in CSS px).
 * When rotation is zero, this is just the <img>; when rotation is non-zero,
 * the wrapper is sized to the rotated bbox and the inner <img> is the
 * un-rotated image painted on top, so the crop coords are in wrapper space.
 * Either way the wrapper preserves the rotated-bbox aspect ratio, so the
 * crop coords scale uniformly into natural-pixel space.
 *
 * `flipX`/`flipY` mirror the source horizontally / vertically. Flips are
 * applied to the SOURCE before rotation so the user always sees rotation
 * around the on-screen center regardless of flip parity.
 *
 * `rotationDeg` is the angle the IMAGE is rotated by — the crop selection
 * itself is axis-aligned in wrapper space. The output canvas is the same
 * axis-aligned rectangle the user saw, at the source's natural pixel scale.
 */
export async function composeCroppedImage(args: {
  sourceImageId: string;
  completedCrop: PixelCrop;
  displayedRect: DOMRect | null;
  flipX?: boolean;
  flipY?: boolean;
  rotationDeg?: number;
}): Promise<File> {
  const {
    sourceImageId,
    completedCrop,
    displayedRect,
    flipX = false,
    flipY = false,
    rotationDeg = 0,
  } = args;
  if (
    !completedCrop ||
    completedCrop.width === 0 ||
    completedCrop.height === 0
  ) {
    throw new Error("Please select a crop area");
  }
  const cleanImage = await fetchOriginalImage(sourceImageId);

  // Bake the flips into an intermediate canvas the size of the source.
  const W = cleanImage.naturalWidth;
  const H = cleanImage.naturalHeight;

  const interim = document.createElement("canvas");
  interim.width = W;
  interim.height = H;
  const ictx = interim.getContext("2d");
  if (!ictx) throw new Error("Failed to get interim 2d context");
  ictx.save();
  ictx.translate(W / 2, H / 2);
  ictx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ictx.drawImage(cleanImage, -W / 2, -H / 2);
  ictx.restore();

  // Wrapper displayed dimensions (rotated bbox at the user's screen scale).
  // Fall back to natural rotated-bbox dims if the rect wasn't captured.
  const rad = (rotationDeg * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(rad));
  const absSin = Math.abs(Math.sin(rad));
  const naturalBboxW = W * absCos + H * absSin;
  const naturalBboxH = W * absSin + H * absCos;
  const dispWrapW = displayedRect?.width || naturalBboxW;
  const dispWrapH = displayedRect?.height || naturalBboxH;

  // Same uniform scale on X and Y (object-contain / aspect-preserving fit).
  // Picking the X scale is fine — it must equal the Y scale by construction.
  const scaleDispToNat = naturalBboxW / dispWrapW;

  // Crop top-left + dims in natural wrapper coords. We need the top-left,
  // NOT the center, for the output translate so source pixels at the bbox
  // center land at (bboxW/2 - cropX, bboxH/2 - cropY) — which is the
  // position of the bbox center within the cropped output rect.
  const cropNatX = completedCrop.x * scaleDispToNat;
  const cropNatY = completedCrop.y * scaleDispToNat;
  const cropNatW = completedCrop.width * scaleDispToNat;
  const cropNatH = completedCrop.height * scaleDispToNat;

  const outW = Math.max(1, Math.round(cropNatW));
  const outH = Math.max(1, Math.round(cropNatH));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Failed to get output 2d context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Canvas transforms accumulate; drawImage at (i, j) ends up at
  //   T_a * R * T_b * (i, j)
  // where:
  //   T_b = translate(-W/2, -H/2)  — brings source center to current origin
  //   R   = rotate(θ)              — same rotation the user saw on screen
  //   T_a = translate(bboxW/2 - cropX, bboxH/2 - cropY)
  //                                — shifts to output coords, where the bbox
  //                                  center lives at (bboxW/2 - cropX, ...)
  ctx.save();
  ctx.translate(naturalBboxW / 2 - cropNatX, naturalBboxH / 2 - cropNatY);
  ctx.rotate(rad);
  ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(interim, 0, 0);
  ctx.restore();

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
 * Grid-split: chop the source image into rows × cols tiles along the user's
 * fractional cut positions, returning one File per tile in row-major order.
 * The user picks cut positions in normalized [0,1] coords against the natural
 * source dimensions; both arrays must already be sorted ascending and trimmed
 * to the open interval (so we never produce zero-width / zero-height tiles).
 *
 * `verticalCuts` define column boundaries (x positions); their count plus one
 * is the number of output columns. `horizontalCuts` define row boundaries.
 * A 3×3 grid uses two cuts in each direction.
 */
export async function composeGridSplit(args: {
  sourceImageId: string;
  verticalCuts: number[];
  horizontalCuts: number[];
}): Promise<File[]> {
  const { sourceImageId, verticalCuts, horizontalCuts } = args;
  const source = await fetchOriginalImage(sourceImageId);
  const W = source.naturalWidth;
  const H = source.naturalHeight;

  const xs = [0, ...verticalCuts.map((v) => Math.round(v * W)), W];
  const ys = [0, ...horizontalCuts.map((v) => Math.round(v * H)), H];

  const files: File[] = [];
  let index = 0;
  for (let r = 0; r < ys.length - 1; r++) {
    const y0 = ys[r];
    const y1 = ys[r + 1];
    const tileH = Math.max(1, y1 - y0);
    for (let c = 0; c < xs.length - 1; c++) {
      const x0 = xs[c];
      const x1 = xs[c + 1];
      const tileW = Math.max(1, x1 - x0);
      const canvas = document.createElement("canvas");
      canvas.width = tileW;
      canvas.height = tileH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get tile 2d context");
      ctx.drawImage(source, x0, y0, tileW, tileH, 0, 0, tileW, tileH);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/png",
          1.0
        );
      });
      files.push(
        new File(
          [blob],
          `split_${r}_${c}_${Date.now()}_${index}.png`,
          { type: "image/png" }
        )
      );
      index++;
    }
  }
  return files;
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
      ...body,
      modelId: body.modelId ?? "nano-banana-2-fast",
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
