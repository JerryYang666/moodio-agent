"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { addToast } from "@heroui/toast";
import {
  Check,
  Crop as CropIcon,
  Eraser,
  Orbit,
  Paintbrush,
  Scissors,
  X,
  Trash2,
} from "lucide-react";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import MarkControls from "@/components/chat/mark-controls";
import AspectRatioSelector from "@/components/chat/aspect-ratio-selector";
import AngleControls from "@/components/chat/angle-controls";
import MagicProgress from "./magic-progress";
import { useImageEdit } from "@/hooks/use-image-edit";
import type { ImageEditMode, CutoutSubMode } from "@/lib/image/edit-pipeline";

export type { ImageEditMode, CutoutSubMode };

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
 *
 * All brush/crop/submit state is owned by useImageEdit so behavior stays in
 * sync with the chat modal.
 */
export default function ImageEditOverlay({
  mode,
  sourceImageId,
  sourceImageUrl,
  screenRect,
  onCommit,
  onCancel,
}: ImageEditOverlayProps) {
  const t = useTranslations("desktop");
  const tCommon = useTranslations("common");

  const edit = useImageEdit({
    mode,
    sourceImageId,
    onSuccess: ({ imageId, imageUrl, editType }) => {
      onCommit({ newImageId: imageId, newImageUrl: imageUrl, editType });
    },
  });

  // Re-initialize the brush canvas when the asset's rendered rect changes
  // (zoom/pan resizing the displayed image). The hook's internal
  // ResizeObserver usually handles this, but the desktop also drives size
  // through `screenRect` props — force an explicit re-init on that change.
  useEffect(() => {
    if (!edit.usesBrush || !edit.imageLoaded) return;
    const raf = requestAnimationFrame(() => edit.initializeCanvas());
    return () => cancelAnimationFrame(raf);
  }, [
    screenRect.width,
    screenRect.height,
    edit.usesBrush,
    edit.imageLoaded,
    edit.initializeCanvas,
    edit,
  ]);

  const handleSubmit = async () => {
    try {
      await edit.submit();
    } catch (err) {
      // Already surfaced via errorKind/errorMessage; also toast.
      const msg = err instanceof Error ? err.message : "Unknown error";
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
    if (mode === "angles") return t("imageEdit.statusAngles");
    return t("imageEdit.statusGeneric");
  }, [mode, t]);

  const titleText = useMemo(() => {
    if (mode === "redraw") return t("imageEdit.titleRedraw");
    if (mode === "crop") return t("imageEdit.titleCrop");
    if (mode === "erase") return t("imageEdit.titleErase");
    if (mode === "angles") return t("imageEdit.titleAngles");
    return t("imageEdit.titleCutout");
  }, [mode, t]);

  const errorText = useMemo(() => {
    if (!edit.errorKind) return null;
    if (edit.errorKind === "promptRequired") return t("imageEdit.promptRequired");
    if (edit.errorKind === "markRequired") return t("imageEdit.markRequired");
    if (edit.errorKind === "cropErrorEmpty") return t("imageEdit.cropErrorEmpty");
    if (edit.errorKind === "insufficientCredits")
      return t("imageEdit.insufficientCredits");
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

  // Side-pane positioning. The right pane sits to the right of the asset
  // rect (12px gap); the bottom pane sits below it. They share screen-space
  // with the canvas container so they pan/zoom with the asset.
  const RIGHT_GAP = 12;
  // Angles mode renders the cube preview + 3 sliders + prompt + hint + footer,
  // which is tall — ~440px comfortably. Other modes fit in a shorter box. The
  // pane itself scrolls internally so the footer buttons never escape; cap at
  // the viewport so it can't run off the bottom either.
  const MIN_PANE_HEIGHT = mode === "angles" ? 440 : 280;
  const sidePaneStyle: React.CSSProperties = {
    position: "absolute",
    left: screenRect.left + screenRect.width + RIGHT_GAP,
    top: screenRect.top,
    width: 280,
    maxHeight: `min(calc(100vh - ${screenRect.top + RIGHT_GAP}px), ${Math.max(screenRect.height, MIN_PANE_HEIGHT)}px)`,
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
        <img
          ref={edit.imageRef}
          src={sourceImageUrl}
          alt=""
          className="w-full h-full object-contain select-none"
          onLoad={() => edit.setImageLoaded(true)}
          draggable={false}
        />

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

        {!edit.isProcessing && edit.usesCrop && edit.imageLoaded && (
          <div className="absolute inset-0">
            <ReactCrop
              crop={edit.crop}
              onChange={(c) => edit.setCrop(c)}
              onComplete={(c) => edit.setCompletedCrop(c)}
              className="absolute inset-0"
            >
              <img
                src={sourceImageUrl}
                alt=""
                className="w-full h-full object-contain select-none"
                draggable={false}
              />
            </ReactCrop>
          </div>
        )}

        {edit.isProcessing && <MagicProgress statusText={statusText} />}
      </div>

      {/* Right-side pane (header, prompt, sub-modes, aspect ratio, errors).
          Body scrolls internally so the footer buttons stay pinned inside
          the pane even when content (e.g. angles cube + 3 sliders + prompt)
          overflows the available vertical space. */}
      <div
        style={sidePaneStyle}
        className="rounded-lg bg-background border border-divider shadow-lg flex flex-col pointer-events-auto overflow-hidden"
      >
        <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TitleIcon size={16} />
          <span>{titleText}</span>
        </div>

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
                {t(sub === "auto" ? "imageEdit.cutoutAuto" : "imageEdit.cutoutManual")}
              </button>
            ))}
          </div>
        )}

        {mode === "redraw" && !edit.isProcessing && (
          <Textarea
            label={t("imageEdit.promptLabel")}
            placeholder={t("imageEdit.promptPlaceholder")}
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
              label={t("imageEdit.anglesPromptLabel")}
              placeholder={t("imageEdit.anglesPromptPlaceholder")}
              value={edit.prompt}
              onValueChange={edit.setPrompt}
              minRows={2}
              maxRows={4}
              classNames={{ input: "text-sm" }}
            />
          </>
        )}

        {/* Aspect ratio — applies to every AI op (not crop, not angles). */}
        {mode !== "crop" && mode !== "angles" && !edit.isProcessing && (
          <AspectRatioSelector
            value={edit.aspectRatio}
            onChange={edit.setAspectRatio}
          />
        )}

        {!edit.isProcessing && (
          <p className="text-xs text-default-500 leading-snug">
            {mode === "redraw" && t("imageEdit.hintRedraw")}
            {mode === "crop" && t("imageEdit.hintCrop")}
            {mode === "erase" && t("imageEdit.hintErase")}
            {mode === "angles" && t("imageEdit.hintAngles")}
            {mode === "cutout" &&
              (edit.cutoutSub === "auto"
                ? t("imageEdit.hintCutoutAuto")
                : t("imageEdit.hintCutoutManual"))}
          </p>
        )}

        {errorText && !edit.isProcessing && (
          <p className="text-xs text-danger leading-snug">{errorText}</p>
        )}
        </div>

        <div className="flex gap-2 p-3 pt-2 border-t border-divider/60 bg-background">
          <Button
            size="sm"
            variant="flat"
            onPress={onCancel}
            isDisabled={edit.isProcessing}
            startContent={<X size={14} />}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            size="sm"
            color="primary"
            onPress={handleSubmit}
            isLoading={edit.isProcessing}
            isDisabled={
              edit.isProcessing ||
              (mode === "redraw" && !edit.prompt.trim()) ||
              (edit.usesBrush && !edit.hasDrawing && !edit.isProcessing && edit.imageLoaded)
            }
            startContent={!edit.isProcessing && <Check size={14} />}
          >
            {t("imageEdit.submit")}
          </Button>
        </div>
      </div>

      {/* Bottom pane: brush color + width picker, and the clear-drawing
          button. Only rendered for brush modes. */}
      {edit.usesBrush && !edit.isProcessing && (
        <div
          style={bottomPaneStyle}
          className="flex justify-center gap-2 pointer-events-auto flex-wrap"
        >
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
