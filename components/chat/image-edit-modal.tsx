"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";
import {
  Check,
  Crop as CropIcon,
  Eraser,
  Paintbrush,
  Scissors,
  Trash2,
  CheckCircle2,
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
import MarkControls from "./mark-controls";
import MagicProgress from "@/components/desktop/magic-progress";
import type { DestinationPick } from "./destination-picker-modal";

export type ChatImageEditMode = "redraw" | "crop" | "erase" | "cutout";
type CutoutSubMode = "auto" | "manual";

interface ImageEditModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  mode: ChatImageEditMode;
  sourceImageId: string;
  sourceImageUrl: string;
  sourceTitle?: string;
  destination: DestinationPick;
  chatId: string | null;
  /** Called when the modal fully closes (user confirmed done). */
  onClose: () => void;
}

/**
 * Chat-mode image edit modal. Mirrors the four desktop image-edit operations
 * (redraw / crop / erase / cutout) but:
 *   - Renders in a modal instead of pinned to a canvas rect.
 *   - Saves the result into a user-picked collection/folder (never replacing
 *     the source).
 *   - Stays open after completion to show the result; the user closes it.
 */
export default function ImageEditModal({
  isOpen,
  onOpenChange,
  mode,
  sourceImageId,
  sourceImageUrl,
  sourceTitle,
  destination,
  chatId,
  onClose,
}: ImageEditModalProps) {
  const t = useTranslations("desktop.imageEdit");
  const tModal = useTranslations("imageEditModal");
  const tCommon = useTranslations("common");

  // Brush state (redraw / erase / cutout-manual).
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [brushColor, setBrushColor] = useState<string>(DEFAULT_MARK_COLOR.value);
  const [brushWidth, setBrushWidth] = useState<number>(DEFAULT_MARK_WIDTH.value);

  const [crop, setCrop] = useState<ReactCropArea>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [cutoutSub, setCutoutSub] = useState<CutoutSubMode>("auto");

  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Result state — once set, modal switches to "done" view.
  const [result, setResult] = useState<{
    imageId: string;
    imageUrl: string;
  } | null>(null);


  const usesBrush =
    mode === "redraw" ||
    mode === "erase" ||
    (mode === "cutout" && cutoutSub === "manual");
  const usesCrop = mode === "crop";

  // Reset when the modal opens. Each flow starts clean.
  useEffect(() => {
    if (!isOpen) return;
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
    setIsProcessing(false);
    setErrorMsg(null);
    setResult(null);
  }, [isOpen]);

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

  // Keep the brush canvas aligned to the image's rendered box. Covers window
  // resizes *and* in-modal layout flips (e.g. controls moving from beside to
  // below once the image's aspect ratio is known).
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
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }, [sourceImageId]);

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

  const composeCroppedImage = useCallback(async (): Promise<File> => {
    if (
      !completedCrop ||
      completedCrop.width === 0 ||
      completedCrop.height === 0
    ) {
      throw new Error("Please select a crop area");
    }
    const cleanImage = await fetchOriginalImage();
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

  // Save the generated image into the chosen destination collection/folder.
  // Non-fatal if this fails: we still show the result, with a toast.
  const saveResultToDestination = async (imageId: string, imageUrl: string) => {
    try {
      const generationDetails = {
        title: sourceTitle || "",
        prompt: mode === "redraw" ? prompt.trim() : `${mode} of ${sourceTitle || "image"}`,
        status: "generated" as const,
        imageUrl,
      };
      const res = await fetch(`/api/collection/${destination.collectionId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          chatId,
          generationDetails,
          folderId: destination.folderId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save to destination");
      }
      return true;
    } catch (err: any) {
      addToast({
        title: tModal("errorTitle"),
        description: err?.message ?? "Failed to save",
        color: "danger",
      });
      return false;
    }
  };

  const handleSubmit = async () => {
    setErrorMsg(null);

    try {
      if (mode === "crop") {
        if (
          !completedCrop ||
          completedCrop.width <= 0 ||
          completedCrop.height <= 0
        ) {
          setErrorMsg(t("cropErrorEmpty"));
          return;
        }
        setIsProcessing(true);
        const file = await composeCroppedImage();
        const upload = await uploadImageClient(file);
        if (!upload.success) {
          throw new Error(upload.error.message || "Upload failed");
        }
        await saveResultToDestination(upload.data.imageId, upload.data.imageUrl);
        setResult({
          imageId: upload.data.imageId,
          imageUrl: upload.data.imageUrl,
        });
        setIsProcessing(false);
        return;
      }

      if (mode === "redraw" && !prompt.trim()) {
        setErrorMsg(t("promptRequired"));
        return;
      }

      const requireMarking = usesBrush;
      if (requireMarking && !hasDrawing) {
        setErrorMsg(t("markRequired"));
        return;
      }

      setIsProcessing(true);

      let markedImageId: string | undefined;
      if (requireMarking) {
        const markedFile = await composeMarkedImage();
        const upload = await uploadImageClient(markedFile, {
          skipCollection: true,
        });
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

      const apiRes = await fetch("/api/image/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          sourceImageId,
          markedImageId,
          prompt: mode === "redraw" ? prompt.trim() : undefined,
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

      await saveResultToDestination(data.imageId, data.imageUrl);
      setResult({ imageId: data.imageId, imageUrl: data.imageUrl });
      setIsProcessing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[ImageEditModal] submit failed:", err);
      if (msg === "INSUFFICIENT_CREDITS") {
        setErrorMsg(t("insufficientCredits"));
      } else {
        setErrorMsg(msg);
      }
      setIsProcessing(false);
      addToast({
        title: t("errorTitle"),
        description: msg,
        color: "danger",
      });
    }
  };

  const statusText = useMemo(() => {
    if (mode === "redraw") return t("statusRedraw");
    if (mode === "erase") return t("statusErase");
    if (mode === "cutout") return t("statusCutout");
    return t("statusGeneric");
  }, [mode, t]);

  const titleText = useMemo(() => {
    if (mode === "redraw") return tModal("titleRedraw");
    if (mode === "crop") return tModal("titleCrop");
    if (mode === "erase") return tModal("titleErase");
    return tModal("titleCutout");
  }, [mode, tModal]);

  const TitleIcon =
    mode === "redraw"
      ? Paintbrush
      : mode === "crop"
        ? CropIcon
        : mode === "erase"
          ? Eraser
          : Scissors;

  const handleClose = () => {
    onClose();
    onOpenChange();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="5xl"
      backdrop="blur"
      scrollBehavior="inside"
      isDismissable={false}
      isKeyboardDismissDisabled
      hideCloseButton={isProcessing}
      classNames={{
        wrapper: "z-[75]",
        base: "max-h-[92dvh] md:!max-w-[92vw] md:w-[92vw]",
      }}
      onClose={result ? onClose : undefined}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <TitleIcon size={18} />
              <span>{titleText}</span>
              <span className="ml-auto text-xs font-normal text-default-500">
                {tModal("destinationLabel")}{" "}
                <span className="font-medium text-foreground">
                  {destination.collectionName}
                </span>
              </span>
            </ModalHeader>

            <ModalBody className="pb-2">
              {result ? (
                // --- DONE STATE ---
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 size={20} />
                    <span className="font-medium">
                      {tModal("savedHeading")}
                    </span>
                  </div>
                  <p className="text-sm text-default-600">
                    {tModal("savedSubheading", {
                      name: destination.collectionName,
                    })}
                  </p>
                  <div className="w-full flex items-center justify-center bg-black/5 rounded-lg p-2">
                    <img
                      src={result.imageUrl}
                      alt={sourceTitle || "Result"}
                      className="max-h-[72vh] object-contain rounded-md"
                    />
                  </div>
                </div>
              ) : (
                // --- EDITING STATE ---
                // Controls always sit to the right of the image on md+; they
                // get a fixed width and their own scroll so they can never be
                // clipped by a very wide source image. The image column uses
                // min-w-0 so it yields space rather than pushing them out.
                <div className="flex flex-col md:flex-row gap-4 items-stretch">
                  {/* Image surface — hugs the image's natural aspect ratio,
                      centered in its column. */}
                  <div className="flex-1 min-w-0 flex items-center justify-center">
                    <div className="relative inline-block bg-black/5 rounded-lg overflow-hidden max-w-full">
                      {!usesCrop && (
                        <img
                          ref={imageRef}
                          src={sourceImageUrl}
                          alt=""
                          className="max-w-full max-h-[72vh] object-contain select-none"
                          onLoad={() => setImageLoaded(true)}
                          draggable={false}
                        />
                      )}

                      {!isProcessing && usesBrush && imageLoaded && (
                        <canvas
                          ref={canvasRef}
                          className="absolute inset-0 cursor-crosshair touch-none"
                          style={{
                            width: canvasSize.width,
                            height: canvasSize.height,
                          }}
                          onMouseDown={handlePointerDown}
                          onMouseMove={handlePointerMove}
                          onMouseUp={handlePointerUp}
                          onMouseLeave={handlePointerUp}
                          onTouchStart={handlePointerDown}
                          onTouchMove={handlePointerMove}
                          onTouchEnd={handlePointerUp}
                        />
                      )}

                      {!isProcessing && usesCrop && (
                        <ReactCrop
                          crop={crop}
                          onChange={(c) => setCrop(c)}
                          onComplete={(c) => setCompletedCrop(c)}
                        >
                          <img
                            ref={imageRef}
                            src={sourceImageUrl}
                            alt=""
                            className="max-w-full max-h-[72vh] object-contain select-none"
                            onLoad={() => setImageLoaded(true)}
                            draggable={false}
                          />
                        </ReactCrop>
                      )}

                      {isProcessing && <MagicProgress statusText={statusText} />}
                    </div>
                  </div>

                  {/* Controls pane — fixed width on md+, scrolls internally so
                      nothing gets clipped when the modal or image is tall. */}
                  <div className="w-full md:w-72 shrink-0 flex flex-col gap-3 md:max-h-[72vh] md:overflow-y-auto md:pr-1">
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
                          {t("cutoutAuto")}
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
                          {t("cutoutManual")}
                        </button>
                      </div>
                    )}

                    {mode === "redraw" && !isProcessing && (
                      <Textarea
                        label={t("promptLabel")}
                        placeholder={t("promptPlaceholder")}
                        value={prompt}
                        onValueChange={setPrompt}
                        minRows={3}
                        maxRows={6}
                        isRequired
                        classNames={{ input: "text-sm" }}
                      />
                    )}

                    {!isProcessing && (
                      <p className="text-xs text-default-500 leading-snug">
                        {mode === "redraw" && t("hintRedraw")}
                        {mode === "crop" && t("hintCrop")}
                        {mode === "erase" && t("hintErase")}
                        {mode === "cutout" &&
                          (cutoutSub === "auto"
                            ? t("hintCutoutAuto")
                            : t("hintCutoutManual"))}
                      </p>
                    )}

                    {usesBrush && !isProcessing && (
                      <div className="flex flex-col gap-2">
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
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-background border border-divider hover:bg-default-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 size={13} />
                          {t("clearMarks")}
                        </button>
                      </div>
                    )}

                    {errorMsg && !isProcessing && (
                      <p className="text-xs text-danger leading-snug">
                        {errorMsg}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>

            <ModalFooter>
              {result ? (
                <Button color="primary" onPress={handleClose}>
                  {tModal("close")}
                </Button>
              ) : (
                <>
                  <Button
                    variant="light"
                    onPress={handleClose}
                    isDisabled={isProcessing}
                  >
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    color="primary"
                    onPress={handleSubmit}
                    isLoading={isProcessing}
                    isDisabled={
                      isProcessing ||
                      (mode === "redraw" && !prompt.trim()) ||
                      (usesBrush && !hasDrawing && imageLoaded)
                    }
                    startContent={!isProcessing && <Check size={14} />}
                  >
                    {tModal("submit")}
                  </Button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
