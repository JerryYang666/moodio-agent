"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";
import {
  Bean,
  Check,
  Crop as CropIcon,
  Eraser,
  Grid3X3,
  Orbit,
  Paintbrush,
  Scissors,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import MarkControls from "./mark-controls";
import AspectRatioSelector from "./aspect-ratio-selector";
import CropAspectRatioSelector from "./crop-aspect-ratio-selector";
import CropTransformControls from "./crop-transform-controls";
import AngleControls from "./angle-controls";
import RotatedCropSurface from "./rotated-crop-surface";
import GridSplitControls from "./grid-split-controls";
import GridSplitOverlay from "./grid-split-overlay";
import MagicProgress from "@/components/desktop/magic-progress";
import { useImageEdit } from "@/hooks/use-image-edit";
import {
  resolveCropAspectRatio,
  type ImageEditMode,
  type EditResult,
} from "@/lib/image/edit-pipeline";
import type { DestinationPick } from "./destination-picker-modal";

export type ChatImageEditMode = ImageEditMode;

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
 *
 * All brush/crop/submit state is owned by useImageEdit so behavior stays in
 * sync with the desktop overlay.
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

  // Result state. Single-image flows set `result`; split mode collects
  // `splitResults` and flips into the done view via `splitDone`.
  const [result, setResult] = useState<EditResult | null>(null);
  const [splitResults, setSplitResults] = useState<EditResult[]>([]);
  const [splitDone, setSplitDone] = useState(false);
  // Refs the saveResultToDestination closure reads to associate each split
  // tile with its row/col in the destination payload.
  const splitTileCounter = useRef(0);

  // Save the generated image into the chosen destination collection/folder.
  // Non-fatal if this fails: we still show the result, with a toast.
  // `tileIndex` only matters for split mode where it disambiguates tile
  // titles; other modes pass 0.
  const saveResultToDestination = async (
    imageId: string,
    imageUrl: string,
    tileIndex: number
  ) => {
    try {
      const generationDetails = {
        title: sourceTitle || "",
        prompt:
          mode === "redraw"
            ? edit.prompt.trim()
            : mode === "angles"
              ? `New angle of ${sourceTitle || "image"}${edit.prompt.trim() ? ` — ${edit.prompt.trim()}` : ""}`
              : mode === "split"
                ? `Tile ${tileIndex + 1} of ${sourceTitle || "image"}`
                : `${mode} of ${sourceTitle || "image"}`,
        status: "generated" as const,
        imageUrl,
      };
      const res = await fetch(
        `/api/collection/${destination.collectionId}/images`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageId,
            chatId,
            generationDetails,
            folderId: destination.folderId,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save to destination");
      }
    } catch (err: any) {
      addToast({
        title: tModal("errorTitle"),
        description: err?.message ?? "Failed to save",
        color: "danger",
      });
    }
  };

  // Inline onSuccess is safe: useImageEdit keeps this in a ref and doesn't
  // depend on it in `submit`, so a fresh closure here doesn't churn the
  // returned `edit` memo identity. saveResultToDestination needs fresh
  // closures (it reads `edit.prompt` etc.) so wrapping this in useCallback
  // here would actually introduce stale-closure bugs.
  const edit = useImageEdit({
    mode,
    sourceImageId,
    onSuccess: async ({ imageId, imageUrl, editType }) => {
      if (editType === "split") {
        // submit() fires onSuccess once per tile. Save each into the
        // destination as it arrives so partial failures don't lose the
        // ones we already produced.
        const tileIndex = splitTileCounter.current++;
        await saveResultToDestination(imageId, imageUrl, tileIndex);
        setSplitResults((prev) => [...prev, { imageId, imageUrl }]);
        return;
      }
      await saveResultToDestination(imageId, imageUrl, 0);
      setResult({ imageId, imageUrl });
    },
  });

  // Reset everything when the modal opens. Each flow starts clean.
  useEffect(() => {
    if (!isOpen) return;
    edit.reset();
    setResult(null);
    setSplitResults([]);
    setSplitDone(false);
    splitTileCounter.current = 0;
    // We intentionally depend only on isOpen — reset is stable across state
    // snapshots and including it in deps would re-run the reset mid-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cost preview for the submit button. Crop + split are client-side only
  // and free; the AI ops all hit /api/image/edit, which defaults to
  // imageSize="2k" (resolution=2) and quality="auto" for this flow. Angles
  // uses its own model id; everything else falls back to the client default
  // nano-banana-2-fast.
  const costModelId = useMemo(() => {
    if (mode === "crop" || mode === "split") return null;
    if (mode === "angles") return "qwen-image-edit-angles";
    return "nano-banana-2-fast";
  }, [mode]);

  const [cost, setCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !costModelId) {
      setCost(null);
      return;
    }
    let cancelled = false;
    setCostLoading(true);
    const params = new URLSearchParams({
      modelId: costModelId,
      resolution: "2",
    });
    fetch(`/api/image/cost?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.cost === "number") setCost(data.cost);
      })
      .catch((err) => {
        console.error("[image-edit-modal] cost fetch failed:", err);
      })
      .finally(() => {
        if (!cancelled) setCostLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, costModelId]);

  const handleSubmit = async () => {
    try {
      // Reset split counters before each attempt so retries don't carry stale
      // tile indices into the destination title.
      splitTileCounter.current = 0;
      setSplitResults([]);
      setSplitDone(false);
      await edit.submit();
      if (mode === "split") setSplitDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
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
    if (mode === "angles") return t("statusAngles");
    if (mode === "split") return t("statusSplit");
    return t("statusGeneric");
  }, [mode, t]);

  const titleText = useMemo(() => {
    if (mode === "redraw") return tModal("titleRedraw");
    if (mode === "crop") return tModal("titleCrop");
    if (mode === "erase") return tModal("titleErase");
    if (mode === "angles") return tModal("titleAngles");
    if (mode === "split") return tModal("titleSplit");
    return tModal("titleCutout");
  }, [mode, tModal]);

  const errorText = useMemo(() => {
    if (!edit.errorKind) return null;
    if (edit.errorKind === "promptRequired") return t("promptRequired");
    if (edit.errorKind === "markRequired") return t("markRequired");
    if (edit.errorKind === "cropErrorEmpty") return t("cropErrorEmpty");
    if (edit.errorKind === "gridEmpty") return t("gridEmpty");
    if (edit.errorKind === "insufficientCredits") return t("insufficientCredits");
    return edit.errorMessage;
  }, [edit.errorKind, edit.errorMessage, t]);

  const TitleIcon =
    mode === "redraw"
      ? Paintbrush
      : mode === "crop"
        ? CropIcon
        : mode === "erase"
          ? Eraser
          : mode === "angles"
            ? Orbit
            : mode === "split"
              ? Grid3X3
              : Scissors;

  // Static-image crop path (rotation === 0): flips are baked into the <img>
  // via CSS transform. With rotation, the RotatedCropSurface owns the
  // transform internally so this style isn't applied.
  const cropImageStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (mode !== "crop") return undefined;
    if (!edit.cropFlipX && !edit.cropFlipY) return undefined;
    const sx = edit.cropFlipX ? -1 : 1;
    const sy = edit.cropFlipY ? -1 : 1;
    return { transform: `scale(${sx}, ${sy})` };
  }, [mode, edit.cropFlipX, edit.cropFlipY]);

  const cropAspectValue = useMemo<number | undefined>(() => {
    if (mode !== "crop") return undefined;
    const img = edit.imageRef.current;
    const w = img?.naturalWidth ?? 0;
    const h = img?.naturalHeight ?? 0;
    return resolveCropAspectRatio(edit.cropAspect, w, h);
    // imageLoaded forces a recompute once natural dims are known.
  }, [mode, edit.cropAspect, edit.imageLoaded, edit.imageRef]);

  // Anything non-zero (slider tilt or 90° step) takes the rotated rendering
  // path. The 0° fast-path is preserved so unrotated edits behave exactly
  // like before, in particular wrt ReactCrop's measurement.
  const usesRotatedCrop = mode === "crop" && edit.cropRotationTotal !== 0;

  const showDoneView = result !== null || (mode === "split" && splitDone);

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
      hideCloseButton={edit.isProcessing}
      classNames={{
        wrapper: "z-[75]",
        base: "max-h-[92dvh] md:!max-w-[92vw] md:w-[92vw]",
      }}
      onClose={showDoneView ? onClose : undefined}
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
              {showDoneView ? (
                // --- DONE STATE ---
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 size={20} />
                    <span className="font-medium">
                      {mode === "split"
                        ? tModal("savedHeadingSplit", {
                            count: splitResults.length,
                          })
                        : tModal("savedHeading")}
                    </span>
                  </div>
                  <p className="text-sm text-default-600">
                    {tModal("savedSubheading", {
                      name: destination.collectionName,
                    })}
                  </p>
                  <div className="w-full flex items-center justify-center bg-black/5 rounded-lg p-2">
                    {mode === "split" ? (
                      <div
                        className="grid gap-1 max-h-[72vh] overflow-auto"
                        style={{
                          gridTemplateColumns: `repeat(${edit.gridConfig.verticalCuts.length + 1}, minmax(0, 1fr))`,
                          width: "fit-content",
                          maxWidth: "100%",
                        }}
                      >
                        {splitResults.map((r) => (
                          <img
                            key={r.imageId}
                            src={r.imageUrl}
                            alt=""
                            className="block min-w-0 max-w-full object-contain rounded-sm"
                          />
                        ))}
                      </div>
                    ) : result ? (
                      <img
                        src={result.imageUrl}
                        alt={sourceTitle || "Result"}
                        className="max-h-[72vh] object-contain rounded-md"
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                // --- EDITING STATE ---
                // Controls always sit to the right of the image on md+; they
                // get a fixed width and their own scroll so they can never be
                // clipped by a very wide source image. The image column uses
                // min-w-0 so it yields space rather than pushing them out.
                <div className="flex flex-col md:flex-row gap-4 items-stretch">
                  <div className="flex-1 min-w-0 flex items-center justify-center">
                    <div className="relative inline-flex bg-black/5 overflow-hidden max-w-full">
                      {!edit.usesCrop && !edit.usesGrid && (
                        <img
                          ref={edit.imageRef}
                          src={sourceImageUrl}
                          alt=""
                          className="block max-w-full max-h-[72vh] object-contain select-none"
                          onLoad={() => edit.setImageLoaded(true)}
                          draggable={false}
                        />
                      )}

                      {edit.usesGrid && (
                        <div className="relative">
                          <img
                            ref={edit.imageRef}
                            src={sourceImageUrl}
                            alt=""
                            className="block max-w-full max-h-[72vh] object-contain select-none"
                            onLoad={() => edit.setImageLoaded(true)}
                            draggable={false}
                          />
                          {!edit.isProcessing && (
                            <GridSplitOverlay
                              config={edit.gridConfig}
                              onChange={edit.setGridConfig}
                            />
                          )}
                        </div>
                      )}

                      {!edit.isProcessing && edit.usesBrush && edit.imageLoaded && (
                        <canvas
                          ref={edit.canvasRef}
                          className="absolute inset-0 cursor-crosshair touch-none"
                          style={{
                            width: edit.canvasSize.width,
                            height: edit.canvasSize.height,
                          }}
                          onMouseDown={edit.handlePointerDown}
                          onMouseMove={edit.handlePointerMove}
                          onMouseUp={edit.handlePointerUp}
                          onMouseLeave={edit.handlePointerUp}
                          onTouchStart={edit.handlePointerDown}
                          onTouchMove={edit.handlePointerMove}
                          onTouchEnd={edit.handlePointerUp}
                        />
                      )}

                      {!edit.isProcessing && edit.usesCrop && !usesRotatedCrop && (
                        // 0° fast path: image is static, flips applied to
                        // <img>. ReactCrop's max-h has to live on the
                        // <ReactCrop> element — its inner <img> is pinned to
                        // max-height:inherit, otherwise the modal scrolls.
                        <ReactCrop
                          crop={edit.crop}
                          onChange={(c) => edit.setCrop(c)}
                          onComplete={(c) => edit.setCompletedCrop(c)}
                          aspect={cropAspectValue}
                          style={{ maxHeight: "72vh", maxWidth: "100%" }}
                        >
                          <img
                            ref={(el) => {
                              edit.imageRef.current = el;
                              edit.cropContainerRef.current = el;
                            }}
                            src={sourceImageUrl}
                            alt=""
                            className="block max-w-full max-h-[72vh] object-contain select-none"
                            style={cropImageStyle}
                            onLoad={() => edit.setImageLoaded(true)}
                            draggable={false}
                          />
                        </ReactCrop>
                      )}

                      {!edit.isProcessing && edit.usesCrop && usesRotatedCrop && (
                        <RotatedCropSurface
                          src={sourceImageUrl}
                          rotationDeg={edit.cropRotationTotal}
                          flipX={edit.cropFlipX}
                          flipY={edit.cropFlipY}
                          aspect={cropAspectValue}
                          crop={edit.crop}
                          onCropChange={(c) => edit.setCrop(c)}
                          onCropComplete={(c) => edit.setCompletedCrop(c)}
                          imageRef={edit.imageRef}
                          cropContainerRef={edit.cropContainerRef}
                          onImageLoad={() => edit.setImageLoaded(true)}
                          layout="modal"
                        />
                      )}

                      {edit.isProcessing && (
                        <MagicProgress statusText={statusText} />
                      )}
                    </div>
                  </div>

                  {/* Controls pane — fixed width on md+, scrolls internally so
                      nothing gets clipped when the modal or image is tall. */}
                  <div className="w-full md:w-72 shrink-0 flex flex-col gap-3 md:max-h-[72vh] md:overflow-y-auto md:pr-1">
                    {mode === "cutout" && !edit.isProcessing && (
                      <div className="flex gap-1 p-1 rounded-md bg-default-100">
                        {(["auto", "manual"] as const).map((sub) => (
                          <button
                            key={sub}
                            type="button"
                            className={[
                              "flex-1 px-2 py-1 rounded text-xs transition-colors",
                              edit.cutoutSub === sub
                                ? "bg-background shadow"
                                : "hover:bg-default-200",
                            ].join(" ")}
                            onClick={() => edit.setCutoutSub(sub)}
                          >
                            {t(sub === "auto" ? "cutoutAuto" : "cutoutManual")}
                          </button>
                        ))}
                      </div>
                    )}

                    {mode === "redraw" && !edit.isProcessing && (
                      <Textarea
                        label={t("promptLabel")}
                        placeholder={t("promptPlaceholder")}
                        value={edit.prompt}
                        onValueChange={edit.setPrompt}
                        minRows={3}
                        maxRows={6}
                        isRequired
                        classNames={{ input: "text-sm" }}
                      />
                    )}

                    {mode === "angles" && !edit.isProcessing && (
                      <>
                        <AngleControls
                          horizontalAngle={edit.horizontalAngle}
                          verticalAngle={edit.verticalAngle}
                          zoom={edit.zoom}
                          onHorizontalChange={edit.setHorizontalAngle}
                          onVerticalChange={edit.setVerticalAngle}
                          onZoomChange={edit.setZoom}
                          onReset={edit.resetAngles}
                        />
                        <Textarea
                          label={t("anglesPromptLabel")}
                          placeholder={t("anglesPromptPlaceholder")}
                          value={edit.prompt}
                          onValueChange={edit.setPrompt}
                          minRows={2}
                          maxRows={4}
                          classNames={{ input: "text-sm" }}
                        />
                      </>
                    )}

                    {mode !== "crop" && mode !== "angles" && !edit.isProcessing && (
                      <AspectRatioSelector
                        value={edit.aspectRatio}
                        onChange={edit.setAspectRatio}
                      />
                    )}

                    {mode === "crop" && !edit.isProcessing && (
                      <>
                        <CropAspectRatioSelector
                          value={edit.cropAspect}
                          onChange={edit.setCropAspect}
                        />
                        <CropTransformControls
                          flipX={edit.cropFlipX}
                          flipY={edit.cropFlipY}
                          onToggleFlipX={edit.toggleCropFlipX}
                          onToggleFlipY={edit.toggleCropFlipY}
                          rotationFine={edit.cropRotationFine}
                          onRotationFineChange={edit.setCropRotationFine}
                          onRotateLeft90={edit.rotateCropLeft90}
                          onRotateRight90={edit.rotateCropRight90}
                          rotationTotal={edit.cropRotationTotal}
                          onReset={edit.resetCropTransforms}
                        />
                      </>
                    )}

                    {mode === "split" && !edit.isProcessing && (
                      <GridSplitControls
                        config={edit.gridConfig}
                        onChange={edit.setGridConfig}
                      />
                    )}

                    {!edit.isProcessing && (
                      <p className="text-xs text-default-500 leading-snug">
                        {mode === "redraw" && t("hintRedraw")}
                        {mode === "crop" && t("hintCrop")}
                        {mode === "erase" && t("hintErase")}
                        {mode === "angles" && t("hintAngles")}
                        {mode === "split" && t("hintSplit")}
                        {mode === "cutout" &&
                          (edit.cutoutSub === "auto"
                            ? t("hintCutoutAuto")
                            : t("hintCutoutManual"))}
                      </p>
                    )}

                    {edit.usesBrush && !edit.isProcessing && (
                      <div className="flex flex-col gap-2">
                        <MarkControls
                          color={edit.brushColor}
                          width={edit.brushWidth}
                          onColorChange={edit.setBrushColor}
                          onWidthChange={edit.setBrushWidth}
                          className="bg-background"
                        />
                        <button
                          type="button"
                          onClick={edit.handleClearDrawing}
                          disabled={!edit.hasDrawing}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-background border border-divider hover:bg-default-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 size={13} />
                          {t("clearMarks")}
                        </button>
                      </div>
                    )}

                    {errorText && !edit.isProcessing && (
                      <p className="text-xs text-danger leading-snug">
                        {errorText}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>

            <ModalFooter>
              {showDoneView ? (
                <Button color="primary" onPress={handleClose}>
                  {tModal("close")}
                </Button>
              ) : (
                <>
                  <Button
                    variant="light"
                    onPress={handleClose}
                    isDisabled={edit.isProcessing}
                  >
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    color="primary"
                    onPress={handleSubmit}
                    isLoading={edit.isProcessing}
                    isDisabled={
                      edit.isProcessing ||
                      (mode === "redraw" && !edit.prompt.trim()) ||
                      (edit.usesBrush && !edit.hasDrawing && edit.imageLoaded) ||
                      (edit.usesCrop &&
                        (!edit.completedCrop ||
                          edit.completedCrop.width <= 0 ||
                          edit.completedCrop.height <= 0))
                    }
                    startContent={!edit.isProcessing && <Check size={14} />}
                    endContent={
                      !edit.isProcessing && costModelId ? (
                        costLoading ? (
                          <Spinner size="sm" />
                        ) : cost !== null && cost > 0 ? (
                          <span className="flex items-center gap-0.5 font-semibold">
                            <Bean size={14} />
                            {cost.toLocaleString()}
                          </span>
                        ) : null
                      ) : null
                    }
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
