"use client";

import { useEffect, useMemo, useState } from "react";
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
import AngleControls from "./angle-controls";
import MagicProgress from "@/components/desktop/magic-progress";
import { useImageEdit } from "@/hooks/use-image-edit";
import type { ImageEditMode, EditResult } from "@/lib/image/edit-pipeline";
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

  // Result state — once set, modal switches to "done" view.
  const [result, setResult] = useState<EditResult | null>(null);

  // Save the generated image into the chosen destination collection/folder.
  // Non-fatal if this fails: we still show the result, with a toast.
  const saveResultToDestination = async (imageId: string, imageUrl: string) => {
    try {
      const generationDetails = {
        title: sourceTitle || "",
        prompt:
          mode === "redraw"
            ? edit.prompt.trim()
            : mode === "angles"
              ? `New angle of ${sourceTitle || "image"}${edit.prompt.trim() ? ` — ${edit.prompt.trim()}` : ""}`
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
    onSuccess: async ({ imageId, imageUrl }) => {
      await saveResultToDestination(imageId, imageUrl);
      setResult({ imageId, imageUrl });
    },
  });

  // Reset everything when the modal opens. Each flow starts clean.
  useEffect(() => {
    if (!isOpen) return;
    edit.reset();
    setResult(null);
    // We intentionally depend only on isOpen — reset is stable across state
    // snapshots and including it in deps would re-run the reset mid-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cost preview for the submit button. Crop is client-side only and free;
  // the AI ops all hit /api/image/edit, which defaults to imageSize="2k"
  // (resolution=2) and quality="auto" for this flow. Angles uses its own
  // model id; everything else falls back to the client default nano-banana-2-fast.
  const costModelId = useMemo(() => {
    if (mode === "crop") return null;
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
      await edit.submit();
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
    return t("statusGeneric");
  }, [mode, t]);

  const titleText = useMemo(() => {
    if (mode === "redraw") return tModal("titleRedraw");
    if (mode === "crop") return tModal("titleCrop");
    if (mode === "erase") return tModal("titleErase");
    if (mode === "angles") return tModal("titleAngles");
    return tModal("titleCutout");
  }, [mode, tModal]);

  const errorText = useMemo(() => {
    if (!edit.errorKind) return null;
    if (edit.errorKind === "promptRequired") return t("promptRequired");
    if (edit.errorKind === "markRequired") return t("markRequired");
    if (edit.errorKind === "cropErrorEmpty") return t("cropErrorEmpty");
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
      hideCloseButton={edit.isProcessing}
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
                  <div className="flex-1 min-w-0 flex items-center justify-center">
                    <div className="relative inline-flex bg-black/5 overflow-hidden max-w-full">
                      {!edit.usesCrop && (
                        <img
                          ref={edit.imageRef}
                          src={sourceImageUrl}
                          alt=""
                          className="block max-w-full max-h-[72vh] object-contain select-none"
                          onLoad={() => edit.setImageLoaded(true)}
                          draggable={false}
                        />
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

                      {!edit.isProcessing && edit.usesCrop && (
                        // react-image-crop pins its inner <img> to
                        // max-height:inherit, so any cap has to live on the
                        // <ReactCrop> element itself — otherwise the img
                        // renders at natural size and the modal body scrolls.
                        <ReactCrop
                          crop={edit.crop}
                          onChange={(c) => edit.setCrop(c)}
                          onComplete={(c) => edit.setCompletedCrop(c)}
                          style={{ maxHeight: "72vh", maxWidth: "100%" }}
                        >
                          <img
                            ref={edit.imageRef}
                            src={sourceImageUrl}
                            alt=""
                            className="block max-w-full max-h-[72vh] object-contain select-none"
                            onLoad={() => edit.setImageLoaded(true)}
                            draggable={false}
                          />
                        </ReactCrop>
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

                    {!edit.isProcessing && (
                      <p className="text-xs text-default-500 leading-snug">
                        {mode === "redraw" && t("hintRedraw")}
                        {mode === "crop" && t("hintCrop")}
                        {mode === "erase" && t("hintErase")}
                        {mode === "angles" && t("hintAngles")}
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
              {result ? (
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
