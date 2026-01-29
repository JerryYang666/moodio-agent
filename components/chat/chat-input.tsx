"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Tooltip } from "@heroui/tooltip";
import { Spinner } from "@heroui/spinner";
import { siteConfig } from "@/config/site";
import {
  Send,
  X,
  ImagePlus,
  Mic,
  Square,
  Upload,
  Library,
  Sparkles,
  Pencil,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MenuConfiguration, { MenuState } from "./menu-configuration";
import { PendingImage, MAX_PENDING_IMAGES } from "./pending-image-types";
import clsx from "clsx";
import { ASSET_DRAG_MIME } from "./asset-dnd";

/**
 * Represents how to render pending images.
 * - "single": A standalone image
 * - "deck": A marked image stacked with its original (marked on top)
 */
type PendingImageRenderItem =
  | { type: "single"; image: PendingImage }
  | { type: "deck"; markedImage: PendingImage; originalImage: PendingImage };

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  recordingTime: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  pendingImages: PendingImage[];
  onRemovePendingImage: (imageId: string) => void;
  onOpenAssetPicker: () => void;
  onAssetDrop: (payload: {
    assetId: string;
    imageId?: string;
    url?: string;
    title?: string;
  }) => void;
  showFileUpload: boolean;
  /** Precision editing state - kept for logic but not rendered as UI */
  precisionEditing: boolean;
  onPrecisionEditingChange: (value: boolean) => void;
  /** Handler to open drawing modal for an image */
  onDrawImage: (imageId: string, imageUrl: string, imageTitle?: string) => void;
  menuState: MenuState;
  onMenuStateChange: (newState: MenuState) => void;
  hasUploadingImages: boolean;
}

export default function ChatInput({
  input,
  onInputChange,
  onSend,
  isSending,
  isRecording,
  isTranscribing,
  recordingTime,
  onStartRecording,
  onStopRecording,
  pendingImages,
  onRemovePendingImage,
  onOpenAssetPicker,
  onAssetDrop,
  showFileUpload,
  // precisionEditing state is kept but not rendered - auto-enabled by drawing or edit mode
  precisionEditing: _precisionEditing,
  onPrecisionEditingChange: _onPrecisionEditingChange,
  onDrawImage,
  menuState,
  onMenuStateChange,
  hasUploadingImages,
}: ChatInputProps) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  // Track which image's popover is open (by imageId)
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  // Track which deck is being hovered
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);

  // Group images into render items (singles and decks)
  // A marked image with its original forms a "deck"
  const renderItems = useMemo((): PendingImageRenderItem[] => {
    const items: PendingImageRenderItem[] = [];
    const processedIds = new Set<string>();

    for (const img of pendingImages) {
      if (processedIds.has(img.imageId)) continue;

      if (img.markedFromImageId) {
        // This is a marked image - find its original
        const originalImage = pendingImages.find(
          (i) => i.imageId === img.markedFromImageId
        );
        if (originalImage) {
          // Create a deck with marked on top, original on bottom
          items.push({
            type: "deck",
            markedImage: img,
            originalImage: originalImage,
          });
          processedIds.add(img.imageId);
          processedIds.add(originalImage.imageId);
        } else {
          // Original was removed, show marked as single
          items.push({ type: "single", image: img });
          processedIds.add(img.imageId);
        }
      } else {
        // Check if this image has a marked version
        const markedImage = pendingImages.find(
          (i) => i.markedFromImageId === img.imageId
        );
        if (markedImage) {
          // Will be handled when we process the marked image
          continue;
        } else {
          // Standalone image
          items.push({ type: "single", image: img });
          processedIds.add(img.imageId);
        }
      }
    }

    return items;
  }, [pendingImages]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const json = e.dataTransfer.getData(ASSET_DRAG_MIME);
      if (json) {
        const parsed = JSON.parse(json);
        if (parsed?.assetId) {
          onAssetDrop(parsed);
          return;
        }
      }
      const fallbackId = e.dataTransfer.getData("text/plain");
      if (fallbackId) {
        onAssetDrop({ assetId: fallbackId });
      }
    } catch (err) {
      console.error("Failed to parse dropped asset", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  // Handle click outside to collapse
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        const target = event.target as Element;

        // Don't collapse if interacting with a portal (dropdown, popover, etc.)
        if (
          target.closest(
            "[data-overlay], [data-state='open'], [role='listbox'], [role='menu']"
          )
        ) {
          return;
        }

        // Don't collapse if audio recording or transcription is in progress
        if (isRecording || isTranscribing) {
          return;
        }

        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRecording, isTranscribing]);

  // Auto-expand if there are attachments or recording
  useEffect(() => {
    if (pendingImages.length > 0 || isRecording) {
      setIsExpanded(true);
    }
  }, [pendingImages.length, isRecording]);

  // Helper to get source icon for pending image
  const getSourceIcon = (source: PendingImage["source"]) => {
    switch (source) {
      case "upload":
        return <Upload size={10} />;
      case "asset":
        return <Library size={10} />;
      case "ai_generated":
        return <Sparkles size={10} />;
    }
  };

  // Helper to get source label for pending image
  const getSourceLabel = (source: PendingImage["source"]) => {
    switch (source) {
      case "upload":
        return t("chat.sourceUpload");
      case "asset":
        return t("chat.sourceAsset");
      case "ai_generated":
        return t("chat.sourceAiGenerated");
    }
  };

  return (
    <div className="absolute bottom-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        ref={containerRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          maxWidth: isExpanded ? "48rem" : "320px",
          width: "100%",
        }}
        className="bg-background/80 backdrop-blur-md rounded-2xl border border-divider shadow-lg pointer-events-auto overflow-hidden transition-[max-width] duration-300 ease-out"
      >
        <div className="flex flex-col">
          {/* Previews Area - Unified pending images display */}
          <AnimatePresence>
            {isExpanded && pendingImages.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-4 overflow-hidden"
              >
                <div className="flex gap-2 flex-wrap mb-2">
                  {/* Display count indicator if multiple images */}
                  {pendingImages.length > 1 && (
                    <div className="text-xs text-default-500 w-full mb-1">
                      {t("chat.pendingImagesCount", {
                        count: pendingImages.length,
                        max: MAX_PENDING_IMAGES,
                      })}
                    </div>
                  )}

                  {/* Render each pending image item (single or deck) */}
                  {renderItems.map((item) => {
                    if (item.type === "single") {
                      const img = item.image;
                      return (
                        <Popover
                          key={img.imageId}
                          placement="top"
                          showArrow
                          offset={10}
                          isOpen={openPopoverId === img.imageId}
                          onOpenChange={(open) => setOpenPopoverId(open ? img.imageId : null)}
                        >
                          <PopoverTrigger>
                            <div className="relative w-fit group cursor-pointer">
                              <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative">
                                {/* Image with loading overlay if uploading */}
                                <img
                                  src={
                                    img.isUploading && img.localPreviewUrl
                                      ? img.localPreviewUrl
                                      : img.url
                                  }
                                  alt={img.title || t("chat.image")}
                                  className={clsx(
                                    "w-full h-full object-cover",
                                    img.isUploading && "opacity-50"
                                  )}
                                />

                                {/* Uploading spinner overlay */}
                                {img.isUploading && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Spinner size="sm" color="white" />
                                  </div>
                                )}

                                {/* Source indicator and title overlay */}
                                {!img.isUploading && (
                                  <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent flex flex-col justify-end p-1">
                                    <div className="flex items-center gap-1 text-white/80">
                                      {getSourceIcon(img.source)}
                                      <span className="text-[8px] uppercase tracking-wide">
                                        {getSourceLabel(img.source)}
                                      </span>
                                    </div>
                                    {img.title && (
                                      <span className="text-white text-[10px] leading-tight font-medium line-clamp-2">
                                        {img.title}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Remove button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemovePendingImage(img.imageId);
                                }}
                                disabled={img.isUploading}
                                className={clsx(
                                  "absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-10",
                                  img.isUploading
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:bg-default-200"
                                )}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </PopoverTrigger>

                          {/* Hover preview popover */}
                          <PopoverContent className="p-0 overflow-hidden">
                            <div className="relative">
                              {/* Larger preview image */}
                              <img
                                src={
                                  img.isUploading && img.localPreviewUrl
                                    ? img.localPreviewUrl
                                    : img.url
                                }
                                alt={img.title || t("chat.image")}
                                className="max-w-[600px] max-h-[600px] object-contain"
                              />

                              {/* Drawing button overlay - only show when not uploading */}
                              {!img.isUploading && (
                                <div className="absolute top-2 right-2">
                                  <Tooltip content={t("chat.markForChange")}>
                                    <Button
                                      isIconOnly
                                      size="sm"
                                      color="secondary"
                                      variant="solid"
                                      onPress={() => {
                                        setOpenPopoverId(null); // Close popover first
                                        onDrawImage(img.imageId, img.url, img.title);
                                      }}
                                      aria-label={t("chat.markForChange")}
                                      className="shadow-lg"
                                    >
                                      <Pencil size={16} />
                                    </Button>
                                  </Tooltip>
                                </div>
                              )}

                              {/* Title overlay */}
                              {img.title && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2">
                                  {img.title}
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    } else {
                      // Deck: marked image on top, original on bottom
                      const { markedImage, originalImage } = item;
                      const deckId = `deck-${markedImage.imageId}`;
                      const isHovered = hoveredDeckId === deckId;
                      const isUploading = markedImage.isUploading || originalImage.isUploading;

                      return (
                        <div
                          key={deckId}
                          className="relative cursor-pointer"
                          onMouseEnter={() => setHoveredDeckId(deckId)}
                          onMouseLeave={() => setHoveredDeckId(null)}
                          style={{ width: isHovered ? "170px" : "80px", height: "80px" }}
                        >
                          {/* Deck indicator badge */}
                          <div className="absolute -top-2 -left-2 z-20 bg-secondary text-secondary-foreground rounded-full p-1 shadow-sm border border-divider">
                            <Layers size={12} />
                          </div>

                          {/* Original image (bottom of deck) */}
                          <motion.div
                            className="absolute h-20 w-20 rounded-lg border border-divider overflow-hidden shadow-md"
                            initial={false}
                            animate={{
                              x: isHovered ? 0 : 4,
                              y: isHovered ? 0 : 4,
                              rotate: isHovered ? 0 : -3,
                              scale: isHovered ? 1 : 0.95,
                              opacity: isHovered ? 1 : 0.7,
                            }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            style={{ zIndex: 1 }}
                          >
                            <img
                              src={
                                originalImage.isUploading && originalImage.localPreviewUrl
                                  ? originalImage.localPreviewUrl
                                  : originalImage.url
                              }
                              alt={originalImage.title || t("chat.image")}
                              className="w-full h-full object-cover"
                            />
                            {/* Original label overlay when hovered */}
                            {isHovered && (
                              <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent flex flex-col justify-end p-1">
                                <span className="text-white text-[8px] uppercase tracking-wide">
                                  {t("chat.original")}
                                </span>
                                {originalImage.title && (
                                  <span className="text-white text-[10px] leading-tight font-medium line-clamp-1">
                                    {originalImage.title}
                                  </span>
                                )}
                              </div>
                            )}
                          </motion.div>

                          {/* Marked image (top of deck) */}
                          <Popover
                            placement="top"
                            showArrow
                            offset={10}
                            isOpen={openPopoverId === markedImage.imageId}
                            onOpenChange={(open) => setOpenPopoverId(open ? markedImage.imageId : null)}
                          >
                            <PopoverTrigger>
                              <motion.div
                                className="absolute h-20 w-20 rounded-lg border-2 border-secondary overflow-hidden shadow-lg"
                                initial={false}
                                animate={{
                                  x: isHovered ? 90 : 0,
                                  y: 0,
                                  rotate: isHovered ? 0 : 3,
                                }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                style={{ zIndex: 2 }}
                              >
                                <img
                                  src={
                                    markedImage.isUploading && markedImage.localPreviewUrl
                                      ? markedImage.localPreviewUrl
                                      : markedImage.url
                                  }
                                  alt={markedImage.title || t("chat.image")}
                                  className={clsx(
                                    "w-full h-full object-cover",
                                    markedImage.isUploading && "opacity-50"
                                  )}
                                />

                                {/* Uploading spinner overlay */}
                                {markedImage.isUploading && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Spinner size="sm" color="white" />
                                  </div>
                                )}

                                {/* Marked label overlay */}
                                {!markedImage.isUploading && (
                                  <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent flex flex-col justify-end p-1">
                                    <div className="flex items-center gap-1 text-secondary">
                                      <Pencil size={10} />
                                      <span className="text-[8px] uppercase tracking-wide">
                                        {t("chat.marked")}
                                      </span>
                                    </div>
                                    {isHovered && markedImage.title && (
                                      <span className="text-white text-[10px] leading-tight font-medium line-clamp-1">
                                        {markedImage.title}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </motion.div>
                            </PopoverTrigger>

                            {/* Hover preview popover for deck */}
                            <PopoverContent className="p-0 overflow-hidden">
                              <div className="flex flex-col gap-2 p-2">
                                {/* Show both images side by side */}
                                <div className="flex gap-2">
                                  {/* Original image */}
                                  <div className="relative">
                                    <img
                                      src={originalImage.url}
                                      alt={originalImage.title || t("chat.image")}
                                      className="max-w-[280px] max-h-[280px] object-contain rounded"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 rounded-b">
                                      {t("chat.original")}
                                    </div>
                                  </div>
                                  {/* Marked image */}
                                  <div className="relative">
                                    <img
                                      src={
                                        markedImage.isUploading && markedImage.localPreviewUrl
                                          ? markedImage.localPreviewUrl
                                          : markedImage.url
                                      }
                                      alt={markedImage.title || t("chat.image")}
                                      className="max-w-[280px] max-h-[280px] object-contain rounded"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-secondary/90 text-secondary-foreground text-xs p-1 rounded-b flex items-center gap-1">
                                      <Pencil size={10} />
                                      {t("chat.marked")}
                                    </div>
                                  </div>
                                </div>
                                {/* Re-draw button */}
                                {!isUploading && (
                                  <div className="flex justify-end">
                                    <Tooltip content={t("chat.markForChange")}>
                                      <Button
                                        size="sm"
                                        color="secondary"
                                        variant="flat"
                                        onPress={() => {
                                          setOpenPopoverId(null);
                                          onDrawImage(originalImage.imageId, originalImage.url, originalImage.title);
                                        }}
                                        startContent={<Pencil size={14} />}
                                      >
                                        {t("chat.redraw")}
                                      </Button>
                                    </Tooltip>
                                  </div>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>

                          {/* Remove button for the deck (removes the marked image) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemovePendingImage(markedImage.imageId);
                            }}
                            disabled={isUploading}
                            className={clsx(
                              "absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-30",
                              isUploading
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:bg-default-200"
                            )}
                            style={{ right: isHovered ? "-8px" : "-8px" }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    }
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Row */}
          <div className={clsx("flex items-center p-2", isExpanded && "gap-2")}>
            <div
              className={clsx(
                "flex gap-1 items-center overflow-hidden transition-all duration-300 shrink-0",
                isExpanded ? "w-auto opacity-100" : "w-0 opacity-0"
              )}
            >
              {showFileUpload && (
                <Button
                  isIconOnly
                  variant="flat"
                  onPress={onOpenAssetPicker}
                  aria-label={t("chat.addImage")}
                >
                  <ImagePlus size={24} className="text-default-500" />
                </Button>
              )}

              <Popover
                isOpen={
                  isRecording &&
                  siteConfig.audioRecording.maxDuration - recordingTime <=
                  siteConfig.audioRecording.countdownThreshold
                }
                placement="top"
              >
                <PopoverTrigger>
                  <div className="inline-block">
                    <Button
                      isIconOnly
                      variant={isRecording ? "solid" : "flat"}
                      color={isRecording ? "danger" : "default"}
                      onPress={isRecording ? onStopRecording : onStartRecording}
                      aria-label={t("chat.recordVoice")}
                      isLoading={isTranscribing}
                    >
                      {isRecording ? (
                        <Square size={20} />
                      ) : (
                        <Mic size={24} className="text-default-500" />
                      )}
                    </Button>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="bg-danger text-danger-foreground">
                  <div className="px-1 py-1">
                    <div className="text-small font-bold">
                      {t("chat.timeRemaining", {
                        seconds: Math.max(
                          0,
                          siteConfig.audioRecording.maxDuration - recordingTime
                        ),
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <Textarea
              placeholder={t("chat.typeMessage")}
              minRows={1}
              maxRows={isExpanded ? 5 : 1}
              value={input}
              onValueChange={onInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              className="flex-1 min-w-0"
              classNames={{
                input: "text-base",
                inputWrapper:
                  "bg-transparent shadow-none hover:bg-transparent focus-within:bg-transparent",
              }}
              isDisabled={isRecording}
            />

            <Tooltip
              content={hasUploadingImages ? t("chat.waitForUpload") : ""}
              isDisabled={!hasUploadingImages}
            >
              <Button
                isIconOnly
                color="primary"
                aria-label={t("chat.send")}
                onPress={onSend}
                isLoading={isSending}
                isDisabled={isRecording || isTranscribing || hasUploadingImages}
                className="shrink-0"
              >
                <Send size={20} />
              </Button>
            </Tooltip>
          </div>

          {/* Menu Configuration (Bottom) */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-2 pb-2">
                  <MenuConfiguration
                    state={menuState}
                    onStateChange={onMenuStateChange}
                    hasSelectedImages={pendingImages.length > 0}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
