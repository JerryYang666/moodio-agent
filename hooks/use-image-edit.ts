"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Crop as ReactCropArea, PixelCrop } from "react-image-crop";

import {
  DEFAULT_MARK_COLOR,
  DEFAULT_MARK_WIDTH,
} from "@/lib/image/mark-config";
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_ASPECT_RATIO_CHOICE,
  callImageEditApi,
  composeCroppedImage,
  composeMarkedImage,
  markColorNameFromHex,
  resolveAspectRatio,
  resolveEditType,
  resolveOperation,
  uploadCroppedImage,
  uploadMarkedImage,
  type AspectRatioChoice,
  type CutoutSubMode,
  type EditResult,
  type ImageEditMode,
} from "@/lib/image/edit-pipeline";

export type { ImageEditMode, CutoutSubMode, AspectRatioChoice, EditResult };
export { ASPECT_RATIO_OPTIONS, DEFAULT_ASPECT_RATIO_CHOICE };

export type SubmitErrorKind =
  | "promptRequired"
  | "markRequired"
  | "cropErrorEmpty"
  | "insufficientCredits"
  | "other";

export interface UseImageEditOptions {
  mode: ImageEditMode;
  sourceImageId: string;
  /** Optional: override the default model id passed to /api/image/edit. */
  modelId?: string;
  /**
   * Called on successful completion (AI ops and crop alike). The hook keeps
   * `isProcessing` true until the caller resolves — this lets the chat modal
   * save-to-collection before flipping to the done state, while the desktop
   * overlay resolves immediately.
   */
  onSuccess: (result: EditResult & { editType: string }) => void | Promise<void>;
}

export interface UseImageEdit {
  // Refs the UI must wire up to the <img> and <canvas>.
  imageRef: RefObject<HTMLImageElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;

  // Derived flags the UI branches on.
  usesBrush: boolean;
  usesCrop: boolean;

  // Image-load state.
  imageLoaded: boolean;
  setImageLoaded: (v: boolean) => void;

  // Brush state.
  canvasSize: { width: number; height: number };
  brushColor: string;
  brushWidth: number;
  setBrushColor: (hex: string) => void;
  setBrushWidth: (px: number) => void;
  hasDrawing: boolean;

  // Crop state.
  crop: ReactCropArea | undefined;
  completedCrop: PixelCrop | undefined;
  setCrop: (c: ReactCropArea | undefined) => void;
  setCompletedCrop: (c: PixelCrop | undefined) => void;

  // Cutout sub-mode.
  cutoutSub: CutoutSubMode;
  setCutoutSub: (v: CutoutSubMode) => void;

  // Prompt.
  prompt: string;
  setPrompt: (v: string) => void;

  // Aspect ratio choice.
  aspectRatio: AspectRatioChoice;
  setAspectRatio: (v: AspectRatioChoice) => void;

  // Flow state.
  isProcessing: boolean;
  errorKind: SubmitErrorKind | null;
  errorMessage: string | null;

  // Brush canvas lifecycle.
  initializeCanvas: () => void;

  // Pointer handlers (wire to the <canvas>).
  handlePointerDown: (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => void;
  handlePointerMove: (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => void;
  handlePointerUp: () => void;
  handleClearDrawing: () => void;

  // Submit.
  submit: () => Promise<void>;

  // Full reset — used when a modal reopens for a fresh run.
  reset: () => void;
}

/**
 * Owns the shared state + submit orchestration behind the image-edit flow.
 * Both the desktop overlay and the chat modal use this hook and render
 * their own UI around it; all API / canvas / snap logic lives here so
 * behavior can't drift between the two surfaces.
 */
export function useImageEdit(options: UseImageEditOptions): UseImageEdit {
  const { mode, sourceImageId, modelId, onSuccess } = options;

  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [brushColor, setBrushColor] = useState<string>(DEFAULT_MARK_COLOR.value);
  const [brushWidth, setBrushWidth] = useState<number>(DEFAULT_MARK_WIDTH.value);

  const [crop, setCrop] = useState<ReactCropArea | undefined>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>();
  const [cutoutSub, setCutoutSub] = useState<CutoutSubMode>("auto");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatioChoice>(
    DEFAULT_ASPECT_RATIO_CHOICE
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorKind, setErrorKind] = useState<SubmitErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const usesBrush =
    mode === "redraw" ||
    mode === "erase" ||
    (mode === "cutout" && cutoutSub === "manual");
  const usesCrop = mode === "crop";

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

  // Sync brush settings onto the context whenever color/width change.
  // Existing strokes keep their look; future strokes use the new settings.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushWidth;
  }, [brushColor, brushWidth]);

  // Initialize the brush canvas once the image is laid out.
  useEffect(() => {
    if (!imageLoaded || !usesBrush) return;
    const raf = requestAnimationFrame(() => initializeCanvas());
    return () => cancelAnimationFrame(raf);
  }, [imageLoaded, usesBrush, initializeCanvas]);

  // Keep the brush canvas aligned to the <img>'s rendered box. A
  // ResizeObserver handles both window resizes and internal layout flips
  // (e.g. chat modal swapping columns once aspect ratio is known). Clearing
  // the drawing on resize is a known tradeoff for keeping resolution correct.
  useEffect(() => {
    if (!usesBrush || !imageLoaded) return;
    const img = imageRef.current;
    if (!img) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        initializeCanvas();
        setHasDrawing(false);
      });
    });
    ro.observe(img);
    return () => ro.disconnect();
  }, [usesBrush, imageLoaded, initializeCanvas]);

  const getCanvasCoords = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
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
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
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
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
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

  const submit = useCallback(async () => {
    setErrorKind(null);
    setErrorMessage(null);

    try {
      // ---- Crop: client-side only ----
      if (mode === "crop") {
        if (
          !completedCrop ||
          completedCrop.width <= 0 ||
          completedCrop.height <= 0
        ) {
          setErrorKind("cropErrorEmpty");
          return;
        }
        // Capture the displayed <img> rect BEFORE flipping isProcessing: in
        // some UIs the crop <img> unmounts synchronously once processing
        // starts, taking imageRef.current with it.
        const displayedRect =
          imageRef.current?.getBoundingClientRect() ?? null;
        setIsProcessing(true);
        const file = await composeCroppedImage({
          sourceImageId,
          completedCrop,
          displayedRect,
        });
        const uploaded = await uploadCroppedImage(file);
        await onSuccess({ ...uploaded, editType: "crop" });
        setIsProcessing(false);
        return;
      }

      // ---- Redraw / Erase / Cutout (AI) ----
      if (mode === "redraw" && !prompt.trim()) {
        setErrorKind("promptRequired");
        return;
      }

      const requireMarking = usesBrush;
      if (requireMarking && !hasDrawing) {
        setErrorKind("markRequired");
        return;
      }

      setIsProcessing(true);

      let markedImageId: string | undefined;
      if (requireMarking) {
        const brushCanvas = canvasRef.current;
        if (!brushCanvas) throw new Error("Brush canvas not ready");
        const markedFile = await composeMarkedImage({
          sourceImageId,
          brushCanvas,
          displayedCanvasSize: canvasSize,
        });
        markedImageId = await uploadMarkedImage(markedFile);
      }

      const operation = resolveOperation(mode, cutoutSub);
      const editType = resolveEditType(mode, cutoutSub);

      const srcImg = imageRef.current;
      const ratio =
        srcImg && srcImg.naturalWidth > 0 && srcImg.naturalHeight > 0
          ? resolveAspectRatio(
              aspectRatio,
              srcImg.naturalWidth,
              srcImg.naturalHeight
            )
          : undefined;

      const result = await callImageEditApi({
        operation,
        sourceImageId,
        markedImageId,
        prompt: mode === "redraw" ? prompt.trim() : undefined,
        modelId,
        markColor: requireMarking
          ? markColorNameFromHex(brushColor)
          : undefined,
        aspectRatio: ratio,
      });

      await onSuccess({ ...result, editType });
      setIsProcessing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[useImageEdit] submit failed:", err);
      setIsProcessing(false);
      if (msg === "INSUFFICIENT_CREDITS") {
        setErrorKind("insufficientCredits");
        setErrorMessage(null);
      } else {
        setErrorKind("other");
        setErrorMessage(msg);
      }
      throw err;
    }
  }, [
    mode,
    completedCrop,
    sourceImageId,
    onSuccess,
    prompt,
    usesBrush,
    hasDrawing,
    canvasSize,
    cutoutSub,
    aspectRatio,
    modelId,
    brushColor,
  ]);

  const reset = useCallback(() => {
    setImageLoaded(false);
    setIsDrawing(false);
    setHasDrawing(false);
    setCanvasSize({ width: 0, height: 0 });
    setBrushColor(DEFAULT_MARK_COLOR.value);
    setBrushWidth(DEFAULT_MARK_WIDTH.value);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setCutoutSub("auto");
    setPrompt("");
    setAspectRatio(DEFAULT_ASPECT_RATIO_CHOICE);
    setIsProcessing(false);
    setErrorKind(null);
    setErrorMessage(null);
  }, []);

  return useMemo(
    () => ({
      imageRef,
      canvasRef,
      usesBrush,
      usesCrop,
      imageLoaded,
      setImageLoaded,
      canvasSize,
      brushColor,
      brushWidth,
      setBrushColor,
      setBrushWidth,
      hasDrawing,
      crop,
      completedCrop,
      setCrop,
      setCompletedCrop,
      cutoutSub,
      setCutoutSub,
      prompt,
      setPrompt,
      aspectRatio,
      setAspectRatio,
      isProcessing,
      errorKind,
      errorMessage,
      initializeCanvas,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleClearDrawing,
      submit,
      reset,
    }),
    // Note: handlers read from refs/state via closure; re-creating them per
    // render is cheap and keeps this object shape stable per state snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      usesBrush,
      usesCrop,
      imageLoaded,
      canvasSize,
      brushColor,
      brushWidth,
      hasDrawing,
      crop,
      completedCrop,
      cutoutSub,
      prompt,
      aspectRatio,
      isProcessing,
      errorKind,
      errorMessage,
      initializeCanvas,
      submit,
      reset,
    ]
  );
}
