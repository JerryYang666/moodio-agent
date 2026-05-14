"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonGroup } from "@heroui/button";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import {
  Bean,
  Check,
  ChevronDown,
  Copy,
  Crop as CropIcon,
  Eraser,
  Grid3X3,
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
import CropAspectRatioSelector from "@/components/chat/crop-aspect-ratio-selector";
import CropTransformControls from "@/components/chat/crop-transform-controls";
import AngleControls from "@/components/chat/angle-controls";
import RotatedCropSurface from "@/components/chat/rotated-crop-surface";
import GridSplitControls from "@/components/chat/grid-split-controls";
import GridSplitOverlay from "@/components/chat/grid-split-overlay";
import MagicProgress from "./magic-progress";
import { useImageEdit, type PreparedEditLaunch } from "@/hooks/use-image-edit";
import {
  resolveCropAspectRatio,
  type ImageEditMode,
  type CutoutSubMode,
} from "@/lib/image/edit-pipeline";

export type { ImageEditMode, CutoutSubMode };

/** Where the edit result lands.
 *  - "replace": swap the source asset's imageId (default; keeps imageHistory).
 *  - "newAsset": create a fresh image asset next to the original with no
 *    inherited history; the original asset is untouched. */
export type ImageEditPlacement = "replace" | "newAsset";

const PLACEMENT_STORAGE_KEY = "moodio.imageEdit.lastPlacement";

function readStoredPlacement(): ImageEditPlacement {
  if (typeof window === "undefined") return "replace";
  try {
    const v = window.localStorage.getItem(PLACEMENT_STORAGE_KEY);
    return v === "newAsset" ? "newAsset" : "replace";
  } catch {
    return "replace";
  }
}

function writeStoredPlacement(p: ImageEditPlacement) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLACEMENT_STORAGE_KEY, p);
  } catch {
    // Ignore storage errors (private mode, quota, etc.).
  }
}

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
  /** Crop commits inline (no model call) and lands through this handler. */
  onCommit: (args: {
    newImageId: string;
    newImageUrl: string;
    editType: string;
    placement: ImageEditPlacement;
  }) => void;
  /**
   * Grid-split commits inline like crop, but produces N×M tiles at once.
   * The handler is responsible for laying each tile out as a fresh asset
   * adjacent to the source; rows/cols arrive so the caller can preserve
   * the grid layout the user picked. Placement is irrelevant for split
   * (we never "replace" with multiple assets) and is omitted.
   */
  onCommitSplit: (args: {
    tiles: Array<{ imageId: string; imageUrl: string }>;
    rows: number;
    cols: number;
    editType: string;
  }) => void;
  /**
   * AI ops (redraw/erase/cutout/angles) resolve asynchronously after the
   * overlay closes. The overlay hands the prepared API payload to the
   * parent, which fires the model call in the background and renders an
   * in-flight shimmer on the canvas while the user keeps working.
   */
  onLaunch: (args: {
    apiPayload: PreparedEditLaunch["apiPayload"];
    editType: string;
    placement: ImageEditPlacement;
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
  onCommitSplit,
  onLaunch,
  onCancel,
}: ImageEditOverlayProps) {
  const t = useTranslations("desktop");
  const tCommon = useTranslations("common");

  // Placement governs whether the edit replaces the source asset (keeping
  // imageHistory) or lands as a brand-new asset next to the original. The
  // UI surfaces both via a split-button; the primary action tracks the
  // user's last choice so power users don't re-pick every time.
  const [placement, setPlacement] = useState<ImageEditPlacement>(() =>
    readStoredPlacement()
  );
  // Captured at submit time so the hook's onSuccess callback (which fires
  // after an async model call) uses the choice that was active when the
  // user clicked, not whatever the dropdown is on by the time it resolves.
  const placementInFlightRef = useRef<ImageEditPlacement>("replace");

  // Desktop overlay never takes the full `submit` path — it calls
  // `prepareSubmit` directly and hands AI ops off to the parent so the
  // canvas can stay interactive while the model runs. The onSuccess callback
  // only fires for the crop path (via the legacy `submit`), and we don't
  // reach it here. Kept as a no-op so the hook's type contract is satisfied.
  const edit = useImageEdit({
    mode,
    sourceImageId,
    onSuccess: () => {},
  });

  // Cost preview for the confirm button. Crop is client-side only and free;
  // every other mode hits /api/image/edit and bills credits, so fetch the
  // estimate for the model that prepareSubmit will actually call. The route
  // defaults imageSize to "2k" (resolution=2) and imageQuality to "auto", so
  // we mirror those here.
  const costModelId = useMemo(() => {
    if (mode === "crop" || mode === "split") return null;
    if (mode === "angles") return "qwen-image-edit-angles";
    return "nano-banana-2-fast";
  }, [mode]);

  const [cost, setCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  useEffect(() => {
    if (!costModelId) {
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
        console.error("[image-edit-overlay] cost fetch failed:", err);
      })
      .finally(() => {
        if (!cancelled) setCostLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [costModelId]);

  // No explicit re-init effect for screenRect changes: the <img> inside the
  // overlay is sized `w-full h-full` against a container whose dimensions
  // come from screenRect, so any zoom/pan change resizes the <img> and the
  // hook's ResizeObserver (observing imageRef) handles re-initialization
  // on the same animation frame. An earlier duplicate effect here caused a
  // render-loop via the `edit` dep and has been removed.

  const submitWithPlacement = async (next: ImageEditPlacement) => {
    placementInFlightRef.current = next;
    setPlacement(next);
    writeStoredPlacement(next);
    try {
      const prepared = await edit.prepareSubmit();
      if (!prepared) return; // validation failure; errorKind already set
      if (prepared.kind === "immediate") {
        // Crop: result is final, commit inline and close the overlay.
        onCommit({
          newImageId: prepared.result.imageId,
          newImageUrl: prepared.result.imageUrl,
          editType: prepared.editType,
          placement: next,
        });
        return;
      }
      if (prepared.kind === "split") {
        // Grid split: lay every tile down beside the source. Placement is
        // ignored; "replace original with N images" doesn't make sense.
        onCommitSplit({
          tiles: prepared.results,
          rows: prepared.rows,
          cols: prepared.cols,
          editType: prepared.editType,
        });
        return;
      }
      // AI op: hand the payload off to the parent, which fires the model
      // call in the background. Parent is responsible for closing the
      // overlay and showing the canvas-side shimmer.
      onLaunch({
        apiPayload: prepared.apiPayload,
        editType: prepared.editType,
        placement: next,
      });
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
    if (mode === "split") return t("imageEdit.statusSplit");
    return t("imageEdit.statusGeneric");
  }, [mode, t]);

  const titleText = useMemo(() => {
    if (mode === "redraw") return t("imageEdit.titleRedraw");
    if (mode === "crop") return t("imageEdit.titleCrop");
    if (mode === "erase") return t("imageEdit.titleErase");
    if (mode === "angles") return t("imageEdit.titleAngles");
    if (mode === "split") return t("imageEdit.titleSplit");
    return t("imageEdit.titleCutout");
  }, [mode, t]);

  const errorText = useMemo(() => {
    if (!edit.errorKind) return null;
    if (edit.errorKind === "promptRequired") return t("imageEdit.promptRequired");
    if (edit.errorKind === "markRequired") return t("imageEdit.markRequired");
    if (edit.errorKind === "cropErrorEmpty") return t("imageEdit.cropErrorEmpty");
    if (edit.errorKind === "gridEmpty") return t("imageEdit.gridEmpty");
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
            : mode === "split"
              ? Grid3X3
              : Scissors;

  // Crop tool: the image stays static; flips are applied to the <img>.
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
  }, [
    mode,
    edit.cropAspect,
    edit.imageLoaded,
    edit.imageRef,
  ]);

  const usesRotatedCrop = mode === "crop" && edit.cropRotationTotal !== 0;

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
        {!edit.usesCrop && !edit.usesGrid && (
          <img
            ref={edit.imageRef}
            src={sourceImageUrl}
            alt=""
            className="w-full h-full object-contain select-none"
            onLoad={() => edit.setImageLoaded(true)}
            draggable={false}
          />
        )}

        {edit.usesGrid && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative max-w-full max-h-full">
              <img
                ref={edit.imageRef}
                src={sourceImageUrl}
                alt=""
                className="max-w-full max-h-full object-contain select-none"
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
          // 0° fast path. Flips are applied to the <img> via cropImageStyle.
          <div className="absolute inset-0">
            <ReactCrop
              crop={edit.crop}
              onChange={(c) => edit.setCrop(c)}
              onComplete={(c) => edit.setCompletedCrop(c)}
              aspect={cropAspectValue}
              className="absolute inset-0"
            >
              <img
                ref={(el) => {
                  edit.imageRef.current = el;
                  edit.cropContainerRef.current = el;
                }}
                src={sourceImageUrl}
                alt=""
                className="w-full h-full object-contain select-none"
                style={cropImageStyle}
                onLoad={() => edit.setImageLoaded(true)}
                draggable={false}
              />
            </ReactCrop>
          </div>
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
            layout="overlay"
          />
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
            {mode === "redraw" && t("imageEdit.hintRedraw")}
            {mode === "crop" && t("imageEdit.hintCrop")}
            {mode === "erase" && t("imageEdit.hintErase")}
            {mode === "angles" && t("imageEdit.hintAngles")}
            {mode === "split" && t("imageEdit.hintSplit")}
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
          {(() => {
            const primaryDisabled =
              edit.isProcessing ||
              (mode === "redraw" && !edit.prompt.trim()) ||
              (edit.usesBrush &&
                !edit.hasDrawing &&
                !edit.isProcessing &&
                edit.imageLoaded) ||
              (edit.usesCrop &&
                (!edit.completedCrop ||
                  edit.completedCrop.width <= 0 ||
                  edit.completedCrop.height <= 0));
            // Split always lays N×M tiles next to the source — the
            // replace/save-as-new split-button is meaningless here.
            if (mode === "split") {
              return (
                <Button
                  size="sm"
                  color="primary"
                  onPress={() => submitWithPlacement("newAsset")}
                  isLoading={edit.isProcessing}
                  isDisabled={edit.isProcessing}
                  startContent={
                    edit.isProcessing ? null : <Grid3X3 size={14} />
                  }
                >
                  {t("imageEdit.submitSplit")}
                </Button>
              );
            }
            const primaryLabel =
              placement === "newAsset"
                ? t("imageEdit.submitSaveAsNew")
                : t("imageEdit.submitReplace");
            const primaryIcon = edit.isProcessing ? null : placement ===
              "newAsset" ? (
              <Copy size={14} />
            ) : (
              <Check size={14} />
            );
            const showCost = costModelId !== null && !edit.isProcessing;
            return (
              <ButtonGroup size="sm" color="primary">
                <Button
                  onPress={() => submitWithPlacement(placement)}
                  isLoading={edit.isProcessing}
                  isDisabled={primaryDisabled}
                  startContent={primaryIcon}
                  endContent={
                    showCost ? (
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
                  {primaryLabel}
                </Button>
                <Dropdown placement="top-end">
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      isDisabled={edit.isProcessing}
                      aria-label={t("imageEdit.submitOptions")}
                    >
                      <ChevronDown size={14} />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label={t("imageEdit.submitOptions")}
                    onAction={(key) => {
                      const next: ImageEditPlacement =
                        key === "newAsset" ? "newAsset" : "replace";
                      if (primaryDisabled) {
                        // User hasn't satisfied preconditions yet — just
                        // remember the choice so the primary button label
                        // updates; don't try to submit.
                        setPlacement(next);
                        writeStoredPlacement(next);
                        return;
                      }
                      void submitWithPlacement(next);
                    }}
                  >
                    <DropdownItem
                      key="replace"
                      description={t("imageEdit.submitReplaceDesc")}
                      startContent={<Check size={14} />}
                    >
                      {t("imageEdit.submitReplace")}
                    </DropdownItem>
                    <DropdownItem
                      key="newAsset"
                      description={t("imageEdit.submitSaveAsNewDesc")}
                      startContent={<Copy size={14} />}
                    >
                      {t("imageEdit.submitSaveAsNew")}
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </ButtonGroup>
            );
          })()}
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
