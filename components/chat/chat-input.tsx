"use client";

import { useRef, useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { useFeatureFlag } from "@/lib/feature-flags";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
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
  ChevronDown,
  ChevronUp,
  Plus,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";
import MenuConfiguration, { MenuState } from "./menu-configuration";
import { PendingImage, MAX_PENDING_IMAGES } from "./pending-image-types";
import {
  ReferenceImage,
  ReferenceImageTag,
  MAX_REFERENCE_IMAGES,
  REFERENCE_IMAGE_TAGS,
} from "./reference-image-types";
import clsx from "clsx";
import { ASSET_DRAG_MIME } from "./asset-dnd";
import {
  MentionTextbox,
  MentionTextboxRef,
  MentionItem,
  JSONContent,
} from "@/components/ui/mention-textbox";
import { ImageChipDropdownItem } from "./ImageChip";

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
  /** Initial editor content (JSON or plain text) for restoring drafts */
  initialEditorContent?: JSONContent | string | null;
  /** Callback when input loses focus (for draft saving) */
  onBlur?: () => void;
  /** Reference images - persistent images that don't get cleared on send */
  referenceImages?: ReferenceImage[];
  /** Handler to open asset picker for adding reference images */
  onAddReferenceImage?: () => void;
  /** Handler to remove a reference image */
  onRemoveReferenceImage?: (imageId: string) => void;
  /** Handler to update a reference image's tag */
  onUpdateReferenceImageTag?: (imageId: string, tag: ReferenceImageTag) => void;
  /** Whether the reference images section is collapsed */
  isReferenceImagesCollapsed?: boolean;
  /** Handler to toggle reference images collapsed state */
  onToggleReferenceImagesCollapsed?: () => void;
}

/** Ref handle for ChatInput to allow getting editor content */
export interface ChatInputRef {
  /** Get the editor content as JSON (for draft saving) */
  getEditorJSON: () => JSONContent | null;
  /** Insert plain text at the current cursor position (for voice transcription) */
  insertText: (text: string) => void;
}

const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(function ChatInput({
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
  initialEditorContent,
  onBlur,
  referenceImages = [],
  onAddReferenceImage,
  onRemoveReferenceImage,
  onUpdateReferenceImageTag,
  isReferenceImagesCollapsed = false,
  onToggleReferenceImagesCollapsed,
}, ref) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const mentionTextboxRef = useRef<MentionTextboxRef>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  // Track which image's popover is open (by imageId)
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  // Track which deck is being hovered
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);
  // Track click timeout for distinguishing single vs double click
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Feature flag: show circle-to-edit button (default false if flag not configured)
  const showCircleToEdit = useFeatureFlag<boolean>("circle_to_edit") ?? false;
  
  // Feature flag: show reference images area (default false if flag not configured)
  const showReferenceImages = useFeatureFlag<boolean>("reference_images") ?? false;

  // Expose methods via ref for draft saving
  useImperativeHandle(ref, () => ({
    getEditorJSON: () => mentionTextboxRef.current?.getJSON() || null,
    insertText: (text: string) => mentionTextboxRef.current?.insertText(text),
  }), []);

  // Convert pending images to mention items for the textbox
  const mentionItems: MentionItem[] = useMemo(() => {
    return pendingImages
      .filter((img) => !img.isUploading) // Only show uploaded images
      .map((img) => ({
        id: img.imageId,
        type: "image",
        label: img.title || t("chat.untitledImage"),
        thumbnail: img.url,
        metadata: { source: img.source },
      }));
  }, [pendingImages, t]);

  // Handle inserting a mention chip when clicking on a pending image
  const handleInsertImageMention = useCallback((imageId: string) => {
    const item = mentionItems.find((m) => m.id === imageId);
    if (item && mentionTextboxRef.current) {
      mentionTextboxRef.current.insertMention(item);
      // Keep the input expanded after inserting
      setIsExpanded(true);
    }
  }, [mentionItems]);

  // Handle single/double click on pending images
  // Single click: insert chip, Double click: open popover
  const handleImageClick = useCallback((imageId: string, isUploading: boolean) => {
    if (isUploading) return;
    
    // If there's a pending single-click, this is a double-click
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      // Double click: open popover
      setOpenPopoverId(imageId);
    } else {
      // Set a timeout for single click
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        // Single click: insert chip
        handleInsertImageMention(imageId);
      }, 200); // 200ms delay to wait for potential double-click
    }
  }, [handleInsertImageMention]);

  // Handle mention textbox changes
  const handleMentionChange = useCallback(
    (text: string, _mentions: MentionItem[]) => {
      onInputChange(text);
    },
    [onInputChange]
  );

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
            "[data-overlay], [data-state='open'], [role='listbox'], [role='menu'], [data-mention-dropdown]"
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

  // Helper to get tag label for reference image
  const getTagLabel = (tag: ReferenceImageTag) => {
    switch (tag) {
      case "none":
        return t("chat.tagNone");
      case "subject":
        return t("chat.tagSubject");
      case "scene":
        return t("chat.tagScene");
      case "item":
        return t("chat.tagItem");
      case "style":
        return t("chat.tagStyle");
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
          {/* Reference Images Area - Persistent images that don't get cleared on send */}
          <AnimatePresence>
            {showReferenceImages && isExpanded && referenceImages.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-4 overflow-hidden border-b border-divider"
              >
                {/* Header with collapse toggle */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-default-600">
                      {t("chat.referenceImages")}
                    </span>
                    <Tooltip content={t("chat.referenceImagesInfo")} placement="right">
                      <Info
                        size={14}
                        className="text-default-400 hover:text-default-600 cursor-help"
                      />
                    </Tooltip>
                    <span className="text-xs text-default-400">
                      ({referenceImages.length}/{MAX_REFERENCE_IMAGES})
                    </span>
                  </div>
                  {onToggleReferenceImagesCollapsed && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={onToggleReferenceImagesCollapsed}
                      aria-label={isReferenceImagesCollapsed ? t("chat.expandReferenceImages") : t("chat.collapseReferenceImages")}
                    >
                      {isReferenceImagesCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </Button>
                  )}
                </div>

                {/* Reference images grid - collapsible */}
                <AnimatePresence>
                  {!isReferenceImagesCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="flex gap-2 flex-wrap mb-3 pt-2">
                        {/* Render each reference image */}
                        {referenceImages.map((img) => (
                          <div key={img.imageId} className="relative flex flex-col items-center">
                            {/* Image thumbnail */}
                            <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative">
                              <img
                                src={img.url}
                                alt={img.title || t("chat.image")}
                                className="w-full h-full object-cover"
                              />
                              {/* Title overlay */}
                              {img.title && (
                                <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent flex flex-col justify-end p-1">
                                  <span className="text-white text-[10px] leading-tight font-medium line-clamp-2">
                                    {img.title}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Tag dropdown below image */}
                            {onUpdateReferenceImageTag && (
                              <Dropdown>
                                <DropdownTrigger>
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    className="mt-1 h-6 min-w-0 px-2 text-[10px]"
                                  >
                                    {getTagLabel(img.tag)}
                                    <ChevronDown size={12} className="ml-1" />
                                  </Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                  aria-label={t("chat.selectTag")}
                                  selectionMode="single"
                                  selectedKeys={new Set([img.tag])}
                                  onSelectionChange={(keys) => {
                                    const selected = Array.from(keys)[0] as ReferenceImageTag;
                                    if (selected) {
                                      onUpdateReferenceImageTag(img.imageId, selected);
                                    }
                                  }}
                                >
                                  {REFERENCE_IMAGE_TAGS.map((tag) => (
                                    <DropdownItem key={tag}>
                                      {getTagLabel(tag)}
                                    </DropdownItem>
                                  ))}
                                </DropdownMenu>
                              </Dropdown>
                            )}

                            {/* Remove button */}
                            {onRemoveReferenceImage && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveReferenceImage(img.imageId);
                                }}
                                className="absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-10 hover:bg-default-200"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Add button - dashed border placeholder */}
                        {referenceImages.length < MAX_REFERENCE_IMAGES && onAddReferenceImage && (
                          <div className="flex flex-col items-center">
                            <button
                              onClick={onAddReferenceImage}
                              className="h-20 w-20 rounded-lg border-2 border-dashed border-default-300 hover:border-primary hover:bg-primary/5 flex items-center justify-center transition-colors"
                              aria-label={t("chat.addReferenceImage")}
                            >
                              <Plus size={24} className="text-default-400" />
                            </button>
                            <div className="h-7" /> {/* Spacer to align with tag dropdown */}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Show add button when no reference images but expanded */}
          <AnimatePresence>
            {showReferenceImages && isExpanded && referenceImages.length === 0 && onAddReferenceImage && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-4 overflow-hidden border-b border-divider"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-default-600">
                    {t("chat.referenceImages")}
                  </span>
                  <Tooltip content={t("chat.referenceImagesInfo")} placement="right">
                    <Info
                      size={14}
                      className="text-default-400 hover:text-default-600 cursor-help"
                    />
                  </Tooltip>
                  <button
                    onClick={onAddReferenceImage}
                    className="h-12 w-12 rounded-lg border-2 border-dashed border-default-300 hover:border-primary hover:bg-primary/5 flex items-center justify-center transition-colors"
                    aria-label={t("chat.addReferenceImage")}
                  >
                    <Plus size={20} className="text-default-400" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                        <div key={img.imageId} className="relative w-fit group">
                          {/* Main image container - single click inserts chip, double click opens popover */}
                          <div
                            className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleImageClick(img.imageId, img.isUploading || false);
                            }}
                          >
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

                          {/* Popover for enlarge/edit - controlled programmatically */}
                          <Popover
                            placement="top"
                            showArrow
                            offset={10}
                            isOpen={openPopoverId === img.imageId}
                            onOpenChange={(open) => {
                              if (!open) setOpenPopoverId(null);
                            }}
                          >
                            <PopoverTrigger>
                              <div className="absolute inset-0 pointer-events-none" />
                            </PopoverTrigger>
                            <PopoverContent className="p-0 overflow-hidden max-w-[calc(100vw-2rem)]">
                              <div className="relative">
                                {/* Larger preview image */}
                                <img
                                  src={
                                    img.isUploading && img.localPreviewUrl
                                      ? img.localPreviewUrl
                                      : img.url
                                  }
                                  alt={img.title || t("chat.image")}
                                  className="max-w-[min(600px,calc(100vw-3rem))] max-h-[600px] object-contain"
                                />

                                {/* Drawing button overlay - only show when not uploading and feature flag enabled */}
                                {!img.isUploading && showCircleToEdit && (
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

                          {/* Marked image (top of deck) - single click inserts chip, double click opens popover */}
                          <motion.div
                            className="absolute h-20 w-20 rounded-lg border-2 border-secondary overflow-hidden shadow-lg cursor-pointer"
                            initial={false}
                            animate={{
                              x: isHovered ? 90 : 0,
                              y: 0,
                              rotate: isHovered ? 0 : 3,
                            }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            style={{ zIndex: 2 }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleImageClick(markedImage.imageId, markedImage.isUploading || false);
                            }}
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
                                <div className="flex items-center gap-1 text-purple-300">
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

                          {/* Popover for enlarge/edit - controlled programmatically */}
                          <Popover
                            placement="top"
                            showArrow
                            offset={10}
                            isOpen={openPopoverId === markedImage.imageId}
                            onOpenChange={(open) => {
                              if (!open) setOpenPopoverId(null);
                            }}
                          >
                            <PopoverTrigger>
                              <div className="absolute inset-0 pointer-events-none" />
                            </PopoverTrigger>

                            {/* Hover preview popover for deck */}
                            <PopoverContent className="p-0 overflow-hidden max-w-[calc(100vw-2rem)]">
                              <div className="flex flex-col gap-2 p-2">
                                {/* Show both images - stacked on mobile, side by side on larger screens */}
                                <div className="flex flex-col sm:flex-row gap-2">
                                  {/* Original image */}
                                  <div className="relative">
                                    <img
                                      src={originalImage.url}
                                      alt={originalImage.title || t("chat.image")}
                                      className="max-w-[min(280px,calc(100vw-3rem))] max-h-[280px] object-contain rounded"
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
                                      className="max-w-[min(280px,calc(100vw-3rem))] max-h-[280px] object-contain rounded"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-secondary/90 text-secondary-foreground text-xs p-1 rounded-b flex items-center gap-1">
                                      <Pencil size={10} />
                                      {t("chat.marked")}
                                    </div>
                                  </div>
                                </div>
                                {/* Re-draw button - only show when not uploading and feature flag enabled */}
                                {!isUploading && showCircleToEdit && (
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

            <MentionTextbox
              ref={mentionTextboxRef}
              value={input}
              onChange={handleMentionChange}
              mentionItems={mentionItems}
              placeholder={t("chat.typeMessage")}
              minRows={1}
              maxRows={isExpanded ? 5 : 1}
              onSubmit={onSend}
              onFocusChange={(focused) => {
                if (focused) {
                  setIsExpanded(true);
                } else {
                  // Trigger draft save on blur
                  onBlur?.();
                }
              }}
              disabled={isRecording}
              className="flex-1 min-w-0 bg-transparent"
              renderDropdownItem={(item, isHighlighted) => (
                <ImageChipDropdownItem item={item} isHighlighted={isHighlighted} />
              )}
              t={(key) => t(`mention.${key}`)}
              initialContent={initialEditorContent}
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
});

export default ChatInput;
