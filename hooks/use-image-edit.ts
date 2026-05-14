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
  CROP_ASPECT_RATIO_OPTIONS,
  DEFAULT_ASPECT_RATIO_CHOICE,
  DEFAULT_CROP_ASPECT_CHOICE,
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
  type CropAspectChoice,
  type CutoutSubMode,
  type EditResult,
  type ImageEditMode,
} from "@/lib/image/edit-pipeline";

export type {
  ImageEditMode,
  CutoutSubMode,
  AspectRatioChoice,
  CropAspectChoice,
  EditResult,
};
export {
  ASPECT_RATIO_OPTIONS,
  CROP_ASPECT_RATIO_OPTIONS,
  DEFAULT_ASPECT_RATIO_CHOICE,
  DEFAULT_CROP_ASPECT_CHOICE,
};

export type SubmitErrorKind =
  | "promptRequired"
  | "markRequired"
  | "cropErrorEmpty"
  | "insufficientCredits"
  | "other";

/**
 * Payload produced by `prepareSubmit` for AI ops (redraw / erase / cutout /
 * angles). The caller fires `callImageEditApi(apiPayload)` in the background
 * so the overlay can unmount the moment prepare resolves — letting the user
 * keep interacting with the canvas while the model runs.
 */
export interface PreparedEditLaunch {
  kind: "launch";
  apiPayload: Parameters<typeof callImageEditApi>[0];
  editType: string;
}

/**
 * Payload produced by `prepareSubmit` for crop, which is a client-side
 * compose + upload with no model round-trip. The result is final; the caller
 * commits it immediately (no in-flight shimmer needed).
 */
export interface PreparedEditImmediate {
  kind: "immediate";
  result: EditResult;
  editType: string;
}

export type PreparedEdit = PreparedEditLaunch | PreparedEditImmediate;

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
  usesAngles: boolean;

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

  // Crop-specific aspect choice (Free / Match source / numeric presets).
  // Distinct from `aspectRatio` above, which is for AI flows only.
  cropAspect: CropAspectChoice;
  setCropAspect: (v: CropAspectChoice) => void;

  // Crop transform: a tilt angle (-45..+45) that rotates the crop SELECTION
  // around its center (the image itself stays static). flipX / flipY mirror
  // the displayed image.
  cropTilt: number;
  cropFlipX: boolean;
  cropFlipY: boolean;
  setCropTilt: (deg: number) => void;
  toggleCropFlipX: () => void;
  toggleCropFlipY: () => void;
  resetCropTransforms: () => void;

  // Cutout sub-mode.
  cutoutSub: CutoutSubMode;
  setCutoutSub: (v: CutoutSubMode) => void;

  // Prompt.
  prompt: string;
  setPrompt: (v: string) => void;

  // Aspect ratio choice.
  aspectRatio: AspectRatioChoice;
  setAspectRatio: (v: AspectRatioChoice) => void;

  // Camera-angle state — only read when mode === "angles".
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  setHorizontalAngle: (v: number) => void;
  setVerticalAngle: (v: number) => void;
  setZoom: (v: number) => void;
  resetAngles: () => void;

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

  // Submit — runs prepare + execute in sequence. The modal keeps
  // `isProcessing` true through the model call, so the caller's shimmer
  // stays visible inside the modal. Used by the chat image-edit modal.
  submit: () => Promise<void>;

  // Prepare-only submit. Validates inputs and, for brush/crop modes,
  // composes and uploads the client-side intermediate. Returns a payload
  // describing what to do next:
  //   - `{kind: "launch", apiPayload}` → the caller fires the model call
  //     in the background and closes the overlay immediately.
  //   - `{kind: "immediate", result}` → crop only; the result is final.
  // Returns null if validation failed (errorKind/errorMessage set).
  // Used by the desktop in-canvas overlay so the canvas can remain
  // interactive while the model runs.
  prepareSubmit: () => Promise<PreparedEdit | null>;

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
  // Mid-stroke flag — kept in a ref so handler closures can't go stale and
  // so toggling it doesn't trigger re-renders that rebuild the memo object.
  const isDrawingRef = useRef(false);
  // Stash the caller's onSuccess so `submit` can call the latest version
  // without taking a dep on it. Otherwise every parent render creates a new
  // onSuccess → new submit → new `edit` memo identity, which cascades and
  // has already bitten us once (the canvas init-loop).
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const [imageLoaded, setImageLoaded] = useState(false);
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

  const [cropAspect, setCropAspectState] = useState<CropAspectChoice>(
    DEFAULT_CROP_ASPECT_CHOICE
  );
  const [cropTilt, setCropTiltState] = useState<number>(0);
  const [cropFlipX, setCropFlipX] = useState<boolean>(false);
  const [cropFlipY, setCropFlipY] = useState<boolean>(false);

  // Changing the aspect ratio invalidates the previous selection (a fresh
  // ratio should re-center a new selection), so clear the crop on change.
  // Tilt and flips deliberately leave the selection alone — tilting the
  // crop box around its existing center is the whole point, and flipping
  // mirrors the image without resizing the selection.
  const clearCropSelection = useCallback(() => {
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, []);

  const setCropAspect = useCallback(
    (v: CropAspectChoice) => {
      setCropAspectState(v);
      clearCropSelection();
    },
    [clearCropSelection]
  );

  const setCropTilt = useCallback((deg: number) => {
    const clamped = Math.max(-45, Math.min(45, deg));
    setCropTiltState(clamped);
  }, []);

  const toggleCropFlipX = useCallback(() => {
    setCropFlipX((v) => !v);
  }, []);

  const toggleCropFlipY = useCallback(() => {
    setCropFlipY((v) => !v);
  }, []);

  const resetCropTransforms = useCallback(() => {
    setCropTiltState(0);
    setCropFlipX(false);
    setCropFlipY(false);
  }, []);

  const [horizontalAngle, setHorizontalAngle] = useState<number>(0);
  const [verticalAngle, setVerticalAngle] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(5);

  const resetAngles = useCallback(() => {
    setHorizontalAngle(0);
    setVerticalAngle(0);
    setZoom(5);
  }, []);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorKind, setErrorKind] = useState<SubmitErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const usesBrush =
    mode === "redraw" ||
    mode === "erase" ||
    (mode === "cutout" && cutoutSub === "manual");
  const usesCrop = mode === "crop";
  const usesAngles = mode === "angles";

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

  // Handlers are memoized so the returned `edit` object stays referentially
  // stable across renders (unless brush settings change). The mid-stroke
  // state lives in `isDrawingRef` specifically so handlePointerMove doesn't
  // close over a stale boolean — the previous implementation only worked
  // because handlePointerDown also flipped `hasDrawing`, incidentally
  // rebuilding the memo. That's fragile; a ref makes it explicit.
  const handlePointerDown = useCallback(
    (
      e:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const point = getCanvasCoords(e);
      if (!point) return;
      isDrawingRef.current = true;
      lastPointRef.current = point;
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, brushWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = brushColor;
        ctx.fill();
        setHasDrawing(true);
      }
    },
    [brushColor, brushWidth]
  );

  const handlePointerMove = useCallback(
    (
      e:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ) => {
      if (!isDrawingRef.current) return;
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
    },
    []
  );

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const handleClearDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawing(false);
    }
  }, []);

  // Prepare runs validation + any client-side compose/upload step. For crop
  // the result is final (no model call); for AI ops the returned payload is
  // what the caller will hand to `callImageEditApi`. Keeping prepare
  // separate from the model call lets the desktop overlay close the moment
  // prepare resolves while the canvas keeps its own per-asset shimmer.
  const prepareSubmit = useCallback(async (): Promise<PreparedEdit | null> => {
    setErrorKind(null);
    setErrorMessage(null);

    try {
      // ---- Crop: client-side only. Compose + upload happens here; the
      // result is final, no model call to defer. ----
      if (mode === "crop") {
        if (
          !completedCrop ||
          completedCrop.width <= 0 ||
          completedCrop.height <= 0
        ) {
          setErrorKind("cropErrorEmpty");
          return null;
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
          rotation: cropTilt,
          flipX: cropFlipX,
          flipY: cropFlipY,
        });
        const uploaded = await uploadCroppedImage(file);
        setIsProcessing(false);
        return { kind: "immediate", result: uploaded, editType: "crop" };
      }

      // ---- Angles (AI, no brush/crop, optional prompt) ----
      if (mode === "angles") {
        return {
          kind: "launch",
          apiPayload: {
            operation: "angles",
            sourceImageId,
            markedImageId: undefined,
            prompt: prompt.trim() ? prompt.trim() : undefined,
            modelId: "qwen-image-edit-angles",
            markColor: undefined,
            aspectRatio: undefined,
            horizontalAngle,
            verticalAngle,
            zoom,
          },
          editType: "angles",
        };
      }

      // ---- Redraw / Erase / Cutout (AI) ----
      if (mode === "redraw" && !prompt.trim()) {
        setErrorKind("promptRequired");
        return null;
      }

      const requireMarking = usesBrush;
      if (requireMarking && !hasDrawing) {
        setErrorKind("markRequired");
        return null;
      }

      // Brush-mode: compose + upload the marked image before returning. This
      // MUST happen while the <canvas> is still mounted, which means before
      // the overlay closes in the desktop flow.
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

      setIsProcessing(false);
      return {
        kind: "launch",
        apiPayload: {
          operation,
          sourceImageId,
          markedImageId,
          prompt: mode === "redraw" ? prompt.trim() : undefined,
          modelId,
          markColor: requireMarking
            ? markColorNameFromHex(brushColor)
            : undefined,
          aspectRatio: ratio,
        },
        editType,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[useImageEdit] prepareSubmit failed:", err);
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
    prompt,
    usesBrush,
    hasDrawing,
    canvasSize,
    cutoutSub,
    aspectRatio,
    modelId,
    brushColor,
    horizontalAngle,
    verticalAngle,
    zoom,
    cropTilt,
    cropFlipX,
    cropFlipY,
  ]);

  // Full submit: prepare, then execute. Used by the chat modal, which keeps
  // the modal open and shows its own shimmer until the model resolves.
  const submit = useCallback(async () => {
    try {
      const prepared = await prepareSubmit();
      if (!prepared) return; // validation failure; errorKind already set

      if (prepared.kind === "immediate") {
        await onSuccessRef.current({
          ...prepared.result,
          editType: prepared.editType,
        });
        return;
      }

      setIsProcessing(true);
      const result = await callImageEditApi(prepared.apiPayload);
      await onSuccessRef.current({ ...result, editType: prepared.editType });
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
  }, [prepareSubmit]);

  const reset = useCallback(() => {
    setImageLoaded(false);
    isDrawingRef.current = false;
    lastPointRef.current = null;
    setHasDrawing(false);
    setCanvasSize({ width: 0, height: 0 });
    setBrushColor(DEFAULT_MARK_COLOR.value);
    setBrushWidth(DEFAULT_MARK_WIDTH.value);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setCutoutSub("auto");
    setPrompt("");
    setAspectRatio(DEFAULT_ASPECT_RATIO_CHOICE);
    setCropAspectState(DEFAULT_CROP_ASPECT_CHOICE);
    setCropTiltState(0);
    setCropFlipX(false);
    setCropFlipY(false);
    setHorizontalAngle(0);
    setVerticalAngle(0);
    setZoom(5);
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
      usesAngles,
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
      cropAspect,
      setCropAspect,
      cropTilt,
      cropFlipX,
      cropFlipY,
      setCropTilt,
      toggleCropFlipX,
      toggleCropFlipY,
      resetCropTransforms,
      horizontalAngle,
      verticalAngle,
      zoom,
      setHorizontalAngle,
      setVerticalAngle,
      setZoom,
      resetAngles,
      isProcessing,
      errorKind,
      errorMessage,
      initializeCanvas,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleClearDrawing,
      submit,
      prepareSubmit,
      reset,
    }),
    [
      usesBrush,
      usesCrop,
      usesAngles,
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
      cropAspect,
      setCropAspect,
      cropTilt,
      cropFlipX,
      cropFlipY,
      setCropTilt,
      toggleCropFlipX,
      toggleCropFlipY,
      resetCropTransforms,
      horizontalAngle,
      verticalAngle,
      zoom,
      isProcessing,
      errorKind,
      errorMessage,
      initializeCanvas,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleClearDrawing,
      submit,
      prepareSubmit,
      reset,
    ]
  );
}
