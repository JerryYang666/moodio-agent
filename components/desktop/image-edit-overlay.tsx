"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { addToast } from "@heroui/toast";
import {
  Check,
  Crop as CropIcon,
  Eraser,
  Paintbrush,
  Scissors,
  X,
  Trash2,
} from "lucide-react";
import ReactCrop, {
  type Crop as ReactCropArea,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { uploadImage as uploadImageClient } from "@/lib/upload/client";
import {
  DEFAULT_MARK_COLOR,
  DEFAULT_MARK_WIDTH,
  MARK_COMPOSITE_ALPHA,
  markColorNameFromHex,
} from "@/lib/image/mark-config";
import MarkControls from "@/components/chat/mark-controls";
import MagicProgress from "./magic-progress";

export type ImageEditMode = "redraw" | "crop" | "erase" | "cutout";
export type CutoutSubMode = "auto" | "manual";

interface ImageEditOverlayProps {
  /** Which operation. The modal swaps panes/controls based on this. */
  mode: ImageEditMode;
  /** Asset id used for telemetry / commit notifications. */
  assetId: string;
  /** Source image id (the one currently shown on the canvas). */
  sourceImageId: string;
  /** Display URL — only used for the visible image; mark/edit ops fetch
   *  the original through /api/image/proxy so the canvas isn't tainted. */
  sourceImageUrl: string;
  /** Asset's screen-space rect in CSS pixels relative to the canvas
   *  container (already projected through camera transform by the parent). */
  screenRect: { left: number; top: number; width: number; height: number };
  onCommit: (args: {
    newImageId: string;
    newImageUrl: string;
    editType: string;
  }) => void;
  onCancel: () => void;
}

/**
 * Inline image-edit overlay. Mounted over the target asset on the desktop;
 * surrounding panes float to the right of (and below) the asset rect. While
 * the model call is in flight, the editing surface fades into a magic
 * shimmer pinned to the same rect.
 */
export default function ImageEditOverlay({
  mode,
  assetId,
  sourceImageId,
  sourceImageUrl,
  screenRect,
  onCommit,
  onCancel,
}: ImageEditOverlayProps) {
  const t = useTranslations("desktop");
  const tCommon = useTranslations("common");

  // Brush state (used for redraw / erase / cutout-manual).
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [brushColor, setBrushColor] = useState<string>(DEFAULT_MARK_COLOR.value);
  const [brushWidth, setBrushWidth] = useState<number>(DEFAULT_MARK_WIDTH.value);

  // Crop state.
  const [crop, setCrop] = useState<ReactCropArea>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  // Cutout sub-mode (only used when mode === "cutout").
  const [cutoutSub, setCutoutSub] = useState<CutoutSubMode>("auto");

  // Prompt + processing.
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Whether the current sub-flow uses the brush surface.
  const usesBrush =
    mode === "redraw" ||
    mode === "erase" ||
    (mode === "cutout" && cutoutSub === "manual");
  const usesCrop = mode === "crop";

  // Initialize the brush canvas once the image has loaded and is laid out.
  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const rect = image.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    setCanvasSize({ width: rect.width, height: rect.height });
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, [brushColor, brushWidth]);

  // Sync brush settings onto the canvas context whenever the user picks a
  // new color or width. Existing strokes keep their original look; future
  // strokes use the new settings.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushWidth;
  }, [brushColor, brushWidth]);

  useEffect(() => {
    if (!imageLoaded || !usesBrush) return;
    requestAnimationFrame(() => initializeCanvas());
  }, [imageLoaded, usesBrush, initializeCanvas]);

  // Re-initialize the brush canvas if the asset rect changes (zoom / pan
  // changes its displayed size). This clears the drawing — that's an
  // acceptable cost for keeping the canvas resolution-correct.
  useEffect(() => {
    if (!usesBrush || !imageLoaded) return;
    requestAnimationFrame(() => {
      initializeCanvas();
      setHasDrawing(false);
    });
  }, [
    screenRect.width,
    screenRect.height,
    usesBrush,
    imageLoaded,
    initializeCanvas,
  ]);

  // Pointer handlers (mouse + touch).
  const getCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }
    return { x: cx - rect.left, y: cy - rect.top };
  };

  const handlePointerDown = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const point = getCanvasCoords(e);
    if (!point) return;
    setIsDrawing(true);
    lastPointRef.current = point;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, brushWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = brushColor;
      ctx.fill();
      setHasDrawing(true);
    }
  };

  const handlePointerMove = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    const point = getCanvasCoords(e);
    if (!point || !lastPointRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
      setHasDrawing(true);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const handleClearDrawing = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawing(false);
    }
  };

  // Fetch the ORIGINAL image (not a thumbnail) through our proxy so the
  // export canvas isn't tainted. Returns an HTMLImageElement at natural res.
  const fetchOriginalImage = useCallback(async (): Promise<HTMLImageElement> => {
    const res = await fetch(
      `/api/image/proxy?imageId=${encodeURIComponent(sourceImageId)}`
    );
    if (!res.ok) throw new Error(`Failed to fetch original image: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      return img;
    } finally {
      // Caller no longer needs the blob URL once the image is decoded; revoke
      // immediately to free memory. The decoded HTMLImageElement keeps its
      // own reference to the bitmap.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }, [sourceImageId]);

  // Composite the brush drawing on top of the original-resolution image and
  // return a PNG File ready for upload.
  const composeMarkedImage = useCallback(async (): Promise<File> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Brush canvas not ready");
    const cleanImage = await fetchOriginalImage();

    const out = document.createElement("canvas");
    out.width = cleanImage.naturalWidth;
    out.height = cleanImage.naturalHeight;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Failed to get output 2d context");
    ctx.drawImage(cleanImage, 0, 0);
    // The brush canvas is at displayed-pixel resolution; scale onto the
    // original-resolution output and composite once at MARK_COMPOSITE_ALPHA
    // so overlapping strokes don't compound and the underlying content
    // stays visible to the model.
    const scaleX = cleanImage.naturalWidth / canvasSize.width;
    const scaleY = cleanImage.naturalHeight / canvasSize.height;
    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = MARK_COMPOSITE_ALPHA;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();

    const blob = await new Promise<Blob>((resolve, reject) => {
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/png",
        1.0
      );
    });
    return new File([blob], `marked_${Date.now()}.png`, { type: "image/png" });
  }, [canvasSize.height, canvasSize.width, fetchOriginalImage]);

  // Crop output: draw the selected region from the original-resolution image
  // onto an offscreen canvas and export.
  const composeCroppedImage = useCallback(async (): Promise<File> => {
    if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      throw new Error("Please select a crop area");
    }
    const cleanImage = await fetchOriginalImage();
    // react-image-crop gives display-pixel coords. Convert to original-pixel.
    const displayed = imageRef.current?.getBoundingClientRect();
    const dispW = displayed?.width || cleanImage.naturalWidth;
    const dispH = displayed?.height || cleanImage.naturalHeight;
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
  }, [completedCrop, fetchOriginalImage]);

  // Submit handlers.
  const handleSubmit = async () => {
    setErrorMsg(null);

    try {
      // -------- Crop: client-side only --------
      if (mode === "crop") {
        if (!completedCrop || completedCrop.width <= 0 || completedCrop.height <= 0) {
          setErrorMsg(t("imageEdit.cropErrorEmpty"));
          return;
        }
        setIsProcessing(true);
        const file = await composeCroppedImage();
        const upload = await uploadImageClient(file);
        if (!upload.success) {
          throw new Error(upload.error.message || "Upload failed");
        }
        onCommit({
          newImageId: upload.data.imageId,
          newImageUrl: upload.data.imageUrl,
          editType: "crop",
        });
        return;
      }

      // -------- Redraw: prompt required --------
      if (mode === "redraw" && !prompt.trim()) {
        setErrorMsg(t("imageEdit.promptRequired"));
        return;
      }

      // -------- AI ops: redraw / erase / cutout --------
      const requireMarking = usesBrush;
      if (requireMarking && !hasDrawing) {
        setErrorMsg(t("imageEdit.markRequired"));
        return;
      }

      setIsProcessing(true);

      let markedImageId: string | undefined;
      if (requireMarking) {
        const markedFile = await composeMarkedImage();
        const upload = await uploadImageClient(markedFile, { skipCollection: true });
        if (!upload.success) {
          throw new Error(upload.error.message || "Marked image upload failed");
        }
        markedImageId = upload.data.imageId;
      }

      const operation =
        mode === "redraw"
          ? "redraw"
          : mode === "erase"
            ? "erase"
            : cutoutSub === "manual"
              ? "cutout-manual"
              : "cutout-auto";

      const editType =
        mode === "cutout" ? `cutout-${cutoutSub}` : (mode as string);

      const apiRes = await fetch("/api/image/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          sourceImageId,
          markedImageId,
          prompt: mode === "redraw" ? prompt.trim() : undefined,
          // Pass the user's chosen mark color so the prompt template can
          // reference it explicitly (e.g. "the area marked in blue…").
          markColor: requireMarking
            ? markColorNameFromHex(brushColor)
            : undefined,
        }),
      });
      if (!apiRes.ok) {
        const data = await apiRes.json().catch(() => ({}));
        const code = data?.error || `HTTP ${apiRes.status}`;
        throw new Error(code);
      }
      const data = await apiRes.json();
      if (!data.imageId) throw new Error("No imageId in response");

      onCommit({
        newImageId: data.imageId,
        newImageUrl: data.imageUrl,
        editType,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[ImageEditOverlay] submit failed:", err);
      // Friendly message for credit failures.
      if (msg === "INSUFFICIENT_CREDITS") {
        setErrorMsg(t("imageEdit.insufficientCredits"));
      } else {
        setErrorMsg(msg);
      }
      setIsProcessing(false);
      addToast({
        title: t("imageEdit.errorTitle"),
        description: msg,
        color: "danger",
      });
    }
  };

  const statusText = useMemo(() => {
    if (mode === "redraw") return t("imageEdit.statusRedraw");
    if (mode === "erase") return t("imageEdit.statusErase");
    if (mode === "cutout") return t("imageEdit.statusCutout");
    return t("imageEdit.statusGeneric");
  }, [mode, t]);

  const titleText = useMemo(() => {
    if (mode === "redraw") return t("imageEdit.titleRedraw");
    if (mode === "crop") return t("imageEdit.titleCrop");
    if (mode === "erase") return t("imageEdit.titleErase");
    return t("imageEdit.titleCutout");
  }, [mode, t]);

  const TitleIcon =
    mode === "redraw"
      ? Paintbrush
      : mode === "crop"
        ? CropIcon
        : mode === "erase"
          ? Eraser
          : Scissors;

  // Side-pane positioning. The right pane sits to the right of the asset
  // rect (12px gap); the bottom pane sits below it. They share screen-space
  // with the canvas container so they pan/zoom with the asset.
  const RIGHT_GAP = 12;
  const sidePaneStyle: React.CSSProperties = {
    position: "absolute",
    left: screenRect.left + screenRect.width + RIGHT_GAP,
    top: screenRect.top,
    width: 280,
    maxHeight: Math.max(screenRect.height, 280),
  };
  const bottomPaneStyle: React.CSSProperties = {
    position: "absolute",
    left: screenRect.left,
    top: screenRect.top + screenRect.height + RIGHT_GAP,
    width: screenRect.width,
  };

  return (
    <div
      className="absolute inset-0 z-40"
      // Cover the whole canvas to intercept stray pointer events while the
      // overlay is open. Side panes/canvas inside this div opt back in.
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Editing surface pinned to the asset rect. */}
      <div
        className="absolute"
        style={{
          left: screenRect.left,
          top: screenRect.top,
          width: screenRect.width,
          height: screenRect.height,
        }}
      >
        {/* Display image (display URL is fine — fetch original for canvas). */}
        <img
          ref={imageRef}
          src={sourceImageUrl}
          alt=""
          className="w-full h-full object-contain select-none"
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />

        {/* Brush surface */}
        {!isProcessing && usesBrush && imageLoaded && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 cursor-crosshair touch-none"
            style={{ width: canvasSize.width, height: canvasSize.height }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        )}

        {/* Crop surface */}
        {!isProcessing && usesCrop && imageLoaded && (
          <div className="absolute inset-0">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              className="absolute inset-0"
            >
              {/* react-image-crop needs an <img> child. Use the same image
                  source so coordinates stay consistent. */}
              <img
                src={sourceImageUrl}
                alt=""
                className="w-full h-full object-contain select-none"
                draggable={false}
              />
            </ReactCrop>
          </div>
        )}

        {/* Magic processing animation */}
        {isProcessing && <MagicProgress statusText={statusText} />}
      </div>

      {/* Right-side pane (header, prompt, sub-modes, errors). */}
      <div
        style={sidePaneStyle}
        className="rounded-lg bg-background border border-divider shadow-lg p-3 flex flex-col gap-3 pointer-events-auto"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <TitleIcon size={16} />
          <span>{titleText}</span>
        </div>

        {/* Cutout sub-mode tabs */}
        {mode === "cutout" && !isProcessing && (
          <div className="flex gap-1 p-1 rounded-md bg-default-100">
            <button
              type="button"
              className={[
                "flex-1 px-2 py-1 rounded text-xs transition-colors",
                cutoutSub === "auto"
                  ? "bg-background shadow"
                  : "hover:bg-default-200",
              ].join(" ")}
              onClick={() => setCutoutSub("auto")}
            >
              {t("imageEdit.cutoutAuto")}
            </button>
            <button
              type="button"
              className={[
                "flex-1 px-2 py-1 rounded text-xs transition-colors",
                cutoutSub === "manual"
                  ? "bg-background shadow"
                  : "hover:bg-default-200",
              ].join(" ")}
              onClick={() => setCutoutSub("manual")}
            >
              {t("imageEdit.cutoutManual")}
            </button>
          </div>
        )}

        {/* Redraw prompt */}
        {mode === "redraw" && !isProcessing && (
          <Textarea
            label={t("imageEdit.promptLabel")}
            placeholder={t("imageEdit.promptPlaceholder")}
            value={prompt}
            onValueChange={setPrompt}
            minRows={3}
            maxRows={6}
            isRequired
            classNames={{ input: "text-sm" }}
          />
        )}

        {/* Mode-specific hint */}
        {!isProcessing && (
          <p className="text-xs text-default-500 leading-snug">
            {mode === "redraw" && t("imageEdit.hintRedraw")}
            {mode === "crop" && t("imageEdit.hintCrop")}
            {mode === "erase" && t("imageEdit.hintErase")}
            {mode === "cutout" &&
              (cutoutSub === "auto"
                ? t("imageEdit.hintCutoutAuto")
                : t("imageEdit.hintCutoutManual"))}
          </p>
        )}

        {errorMsg && !isProcessing && (
          <p className="text-xs text-danger leading-snug">{errorMsg}</p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-auto">
          <Button
            size="sm"
            variant="flat"
            onPress={onCancel}
            isDisabled={isProcessing}
            startContent={<X size={14} />}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            size="sm"
            color="primary"
            onPress={handleSubmit}
            isLoading={isProcessing}
            isDisabled={
              isProcessing ||
              (mode === "redraw" && !prompt.trim()) ||
              (usesBrush && !hasDrawing && !isProcessing && imageLoaded)
            }
            startContent={!isProcessing && <Check size={14} />}
          >
            {t("imageEdit.submit")}
          </Button>
        </div>
      </div>

      {/* Bottom pane: brush color + width picker, and the clear-drawing
          button. Only rendered for brush modes. */}
      {usesBrush && !isProcessing && (
        <div
          style={bottomPaneStyle}
          className="flex justify-center gap-2 pointer-events-auto flex-wrap"
        >
          <MarkControls
            color={brushColor}
            width={brushWidth}
            onColorChange={setBrushColor}
            onWidthChange={setBrushWidth}
            className="bg-background"
          />
          <button
            type="button"
            onClick={handleClearDrawing}
            disabled={!hasDrawing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-background border border-divider shadow hover:bg-default-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 size={13} />
            {t("imageEdit.clearMarks")}
          </button>
        </div>
      )}
    </div>
  );
}
