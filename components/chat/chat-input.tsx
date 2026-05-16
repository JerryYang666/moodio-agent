"use client";

import { useRef, useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { useFeatureFlag } from "@/lib/feature-flags";
import { useUserSetting } from "@/lib/user-settings";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Tooltip } from "@heroui/tooltip";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
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
  Bean,
  Video,
  Music,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MenuConfiguration, { MenuState } from "./menu-configuration";
import { MultiShotEditor } from "./multi-shot-editor";
import { KlingElementEditor, areKlingElementsValid } from "./kling-element-editor";
import { SeedanceReferenceEditor } from "./seedance-reference-editor";
import type { MultiPromptShot, KlingElement, MediaReference } from "@/lib/video/models";
import { PendingImage, MAX_PENDING_IMAGES } from "./pending-image-types";
import { PendingVideo, MAX_PENDING_VIDEOS } from "./pending-video-types";
import { PendingAudio } from "./pending-audio-types";
import clsx from "clsx";
import { ASSET_DRAG_MIME } from "./asset-dnd";
import { AssetDropTarget } from "./asset-drop-target";
import type { AssetDropPayload } from "@/hooks/use-asset-drop-zone";
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

export type AssetParamSlot = {
  name: string;
  label: string;
  required: boolean;
  acceptTypes?: ("image" | "video")[];
};

export type AssetParamValue = {
  imageId: string;
  displayUrl: string;
};

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isSending: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  recordingTime: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  pendingImages: PendingImage[];
  onRemovePendingImage: (imageId: string) => void;
  /** Suggested images from last user message (shown as a confirm-to-add box) */
  suggestedImages?: PendingImage[];
  /** Confirm the suggested images and add them to pending area */
  onConfirmSuggestedImages?: () => void;
  /** Dismiss the suggested images */
  onDismissSuggestedImages?: () => void;
  pendingVideos?: PendingVideo[];
  onRemovePendingVideo?: (videoId: string) => void;
  pendingAudios?: PendingAudio[];
  onRemovePendingAudio?: (audioId: string) => void;
  onOpenAssetPicker: () => void;
  onAssetDrop: (payload: {
    assetId: string;
    imageId?: string;
    url?: string;
    title?: string;
  }) => void;
  /** Handler for uploading files (paste or external file drop) */
  onFilesUpload: (files: File[]) => void;
  showFileUpload: boolean;
  /** Precision editing state - kept for logic but not rendered as UI */
  precisionEditing: boolean;
  onPrecisionEditingChange: (value: boolean) => void;
  /** Handler to open drawing modal for an image */
  onDrawImage: (imageId: string, imageUrl: string, imageTitle?: string) => void;
  menuState: MenuState;
  onMenuStateChange: (newState: MenuState) => void;
  hasUploadingImages: boolean;
  /** Callback when input loses focus (flushes draft as a safety net) */
  onBlur?: () => void;
  /** Reference images - persistent images that don't get cleared on send */
  /** Estimated video cost (for video mode send button) */
  videoCost?: number | null;
  /** Whether the video cost is loading */
  videoCostLoading?: boolean;
  /** Estimated image total cost (per-image * quantity, for send button) */
  imageCost?: number | null;
  /** Whether the image cost is loading */
  imageCostLoading?: boolean;
  /** Per-image unit cost (for display next to image size selector) */
  imageUnitCost?: number | null;
  /** Whether the selected video model supports end images */
  videoModelSupportsEndImage?: boolean;
  /** Whether the selected video model has imageParams (first/last frame) */
  videoModelHasImageParams?: boolean;
  /** Active visible params for the selected video model (provider-filtered) */
  videoModelParams?: Array<{ name: string; type: string }>;
  /** Opens the asset picker for element images. Called with (elementIndex, maxImages). */
  onPickElementImages?: (elementIndex: number, maxImages: number) => void;
  /** Resolve an element image ID to a display URL. */
  resolveElementImageUrl?: (imageId: string) => string | undefined;
  /**
   * Opens the asset picker filtered to library elements (with a "Create new"
   * CTA). When the user picks/creates one, the parent appends a new
   * kling_elements entry with `libraryElementId` set so the backend can
   * hydrate canonical fields at submit time.
   */
  onPickLibraryElement?: () => void;
  /** Callback when the input container height changes */
  onHeightChange?: (height: number) => void;
  /** Asset param slots for type: "asset" video model params (rendered in Video Frames Area) */
  assetParamSlots?: AssetParamSlot[];
  /** Current values for asset param slots: param name -> {imageId, displayUrl} */
  assetParamValues?: Record<string, AssetParamValue | null>;
  /** Handler to open asset picker for a specific asset param */
  onOpenAssetParamPicker?: (paramName: string) => void;
  /** Handler to clear an asset param value */
  onClearAssetParam?: (paramName: string) => void;
  /** Whether the asset picker modal is currently open */
  isAssetPickerOpen?: boolean;
  /** Opens the asset picker for media reference images */
  onPickMediaRefImage?: () => void;
  /** Opens the asset picker for media reference videos */
  onPickMediaRefVideo?: () => void;
  /** Opens the asset picker for media reference audio */
  onPickMediaRefAudio?: () => void;
  /** Resolve a media reference image ID to a display URL */
  resolveMediaRefImageUrl?: (id: string) => string | undefined;
  /** Resolve a media reference video ID to a display/thumbnail URL */
  resolveMediaRefVideoUrl?: (id: string) => string | undefined;
  /** Resolve a media reference audio ID to a display URL */
  resolveMediaRefAudioUrl?: (id: string) => string | undefined;
  /** Map of video reference ID to its duration in seconds */
  mediaRefVideoDurations?: Record<string, number>;
  /** Whether the combined reference-video duration exceeds the 15s cap */
  mediaRefVideoOverCap?: boolean;
  /** Drop on the video first-frame (source) slot. Replaces pendingImages[0]. */
  onDropOnSourceFrame?: (payload: AssetDropPayload) => void;
  /** Drop on the video last-frame (end) slot. Replaces pendingImages[1]. */
  onDropOnEndFrame?: (payload: AssetDropPayload) => void;
  /** Drop on a specific asset-param slot. */
  onDropOnAssetParam?: (paramName: string, payload: AssetDropPayload) => void;
  /** Drop on the Seedance media-references zone. */
  onDropOnMediaReference?: (payload: AssetDropPayload) => void;
  /**
   * If provided, the file-drop overlay is portaled into this element and
   * scoped to fill it (absolute inset-0) instead of covering the full viewport.
   * Used on pages like the desktop where another area (the canvas) needs
   * its own drop target alongside the chat panel.
   */
  dropOverlayContainer?: HTMLElement | null;
}

/** Ref handle for ChatInput to allow getting editor content */
export interface ChatInputRef {
  /** Get the editor content as JSON (for draft saving) */
  getEditorJSON: () => JSONContent | null;
  /** Insert plain text at the current cursor position (for voice transcription) */
  insertText: (text: string) => void;
  /** Set the editor content from JSON (for restoring content) */
  setEditorContent: (content: JSONContent) => void;
}

const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(function ChatInput({
  input,
  onInputChange,
  onSend,
  onStop,
  isSending,
  isRecording,
  isTranscribing,
  recordingTime,
  onStartRecording,
  onStopRecording,
  pendingImages,
  onRemovePendingImage,
  suggestedImages = [],
  onConfirmSuggestedImages,
  onDismissSuggestedImages,
  pendingVideos = [],
  onRemovePendingVideo,
  pendingAudios = [],
  onRemovePendingAudio,
  onOpenAssetPicker,
  onAssetDrop,
  onFilesUpload,
  showFileUpload,
  // precisionEditing state is kept but not rendered - auto-enabled by drawing or edit mode
  precisionEditing: _precisionEditing,
  onPrecisionEditingChange: _onPrecisionEditingChange,
  onDrawImage,
  menuState,
  onMenuStateChange,
  hasUploadingImages,
  onBlur,
  videoCost,
  videoCostLoading,
  imageCost,
  imageCostLoading,
  imageUnitCost,
  videoModelSupportsEndImage,
  videoModelHasImageParams,
  videoModelParams = [],
  onPickElementImages,
  resolveElementImageUrl,
  onPickLibraryElement,
  onHeightChange,
  assetParamSlots = [],
  assetParamValues = {},
  onOpenAssetParamPicker,
  onClearAssetParam,
  isAssetPickerOpen = false,
  onPickMediaRefImage,
  onPickMediaRefVideo,
  onPickMediaRefAudio,
  resolveMediaRefImageUrl,
  resolveMediaRefVideoUrl,
  resolveMediaRefAudioUrl,
  mediaRefVideoDurations,
  mediaRefVideoOverCap = false,
  onDropOnSourceFrame,
  onDropOnEndFrame,
  onDropOnAssetParam,
  onDropOnMediaReference,
  dropOverlayContainer = null,
}, ref) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const mentionTextboxRef = useRef<MentionTextboxRef>(null);
  const textareaContainerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  // User-controlled kill switch for the adaptive stacking behavior. Disabled
  // by default; opt-in from the profile page. See the effect below.
  const stackChatInputButtonsEnabled = useUserSetting("stackChatInputButtons");
  // When the textarea grows tall enough to fit two stacked buttons, stack the
  // image/voice buttons vertically to reclaim horizontal space.
  const [stackLeftButtons, setStackLeftButtons] = useState(false);
  // Track which image's popover is open (by imageId)
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  // Track which deck is being hovered
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);
  // Track click timeout for distinguishing single vs double click
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track whether the user is dragging an external file over the browser
  const [isDraggingExternalFile, setIsDraggingExternalFile] = useState(false);
  const dragCounterRef = useRef(0);
  
  // Feature flag: show circle-to-edit button (default false if flag not configured)
  const showCircleToEdit = useFeatureFlag<boolean>("circle_to_edit") ?? false;
  
  // Feature flag: show reference images area (default false if flag not configured)
  // Expose methods via ref for draft saving
  useImperativeHandle(ref, () => ({
    getEditorJSON: () => mentionTextboxRef.current?.getJSON() || null,
    insertText: (text: string) => mentionTextboxRef.current?.insertText(text),
    setEditorContent: (content: JSONContent) => mentionTextboxRef.current?.setContent(content),
  }), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onHeightChange) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange]);

  // Observe the textarea height and stack the image/voice buttons vertically
  // once there is room for two stacked buttons (~2 * 40px + gap).
  //
  // The button group switches flex-direction (row <-> column) instantly via
  // CSS — no framer-motion layout animation on it — so state changes here
  // don't produce a stream of intermediate resize events that could re-cross
  // the threshold mid-animation. The hysteresis band below is still kept as
  // a defense against the steady-state feedback loop where stacking widens
  // the textarea, reflowing text onto fewer lines and dropping the height
  // back below the stack threshold. Without hysteresis, at viewport widths
  // where a line of text sits right at the wrap boundary this flaps every
  // frame. We require the textarea to shrink well below the stack threshold
  // (roughly back to a single line) before unstacking.
  //
  // Gated on the `stackChatInputButtons` user setting. When disabled, we
  // skip creating the observer entirely and force the state back to false
  // so the buttons stay in their default horizontal row. Toggling the
  // setting live subscribes/unsubscribes the observer via the dep array.
  useEffect(() => {
    if (!stackChatInputButtonsEnabled) {
      setStackLeftButtons(false);
      return;
    }
    const el = textareaContainerRef.current;
    if (!el) return;
    const STACK_ON_PX = 88;
    const STACK_OFF_PX = 56;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height =
          entry.borderBoxSize?.[0]?.blockSize ??
          entry.target.getBoundingClientRect().height;
        setStackLeftButtons((prev) => {
          if (prev) {
            return height >= STACK_OFF_PX;
          }
          return height >= STACK_ON_PX;
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stackChatInputButtonsEnabled]);

  // Convert pending images to mention items for the textbox
  const supportsElements = useMemo(
    () => videoModelParams.some((p) => p.type === "kling_elements"),
    [videoModelParams]
  );

  const supportsMediaReferences = useMemo(
    () => videoModelParams.some((p) => p.type === "media_references"),
    [videoModelParams]
  );

  const klingElementVariant =
    menuState.videoModelId === "kling-o3-reference"
      ? "o3-reference"
      : menuState.videoModelId === "kling-v3-omni"
        ? "ksyun"
        : "v3";

  const klingElementsInvalid = useMemo(() => {
    if (!supportsElements) return false;
    const elements = (menuState.videoParams?.kling_elements as KlingElement[]) || [];
    return !areKlingElementsValid(elements, klingElementVariant);
  }, [supportsElements, menuState.videoParams?.kling_elements, klingElementVariant]);

  const mentionItems: MentionItem[] = useMemo(() => {
    const imageItems = pendingImages
      .filter((img) => !img.isUploading && !img.isCompressing)
      .map((img) => ({
        id: img.imageId,
        type: "image",
        label: img.title || t("chat.untitledImage"),
        thumbnail: img.url,
        metadata: { source: img.source },
      }));

    if (menuState.mode !== "video") return imageItems;

    const refItems: MentionItem[] = [];
    if (supportsMediaReferences) {
      const refs = (menuState.videoParams?.media_references as MediaReference[]) || [];
      let imgCount = 0, vidCount = 0, audCount = 0;
      for (const ref of refs) {
        const name = ref.type === "image"
          ? `image${++imgCount}`
          : ref.type === "video"
            ? `video${++vidCount}`
            : `audio${++audCount}`;
        refItems.push({
          id: name,
          type: "reference",
          label: name,
          thumbnail: ref.type === "image"
            ? resolveMediaRefImageUrl?.(ref.id)
            : ref.type === "video"
              ? resolveMediaRefVideoUrl?.(ref.id)
              : resolveMediaRefAudioUrl?.(ref.id),
          metadata: { refType: ref.type, refId: ref.id },
        });
      }
    }

    const elementItems: MentionItem[] = [];
    if (supportsElements) {
      const imageUrlMap = new Map(pendingImages.map((img) => [img.imageId, img.url]));
      const klingElements = (menuState.videoParams?.kling_elements as KlingElement[]) || [];
      for (const el of klingElements) {
        if (!el.name) continue;
        elementItems.push({
          id: el.name,
          type: "element",
          label: el.name,
          thumbnail: (el.element_input_ids?.[0] && (resolveElementImageUrl?.(el.element_input_ids[0]) || imageUrlMap.get(el.element_input_ids[0]))) || undefined,
          metadata: {
            description: el.description,
            element_input_ids: el.element_input_ids,
          },
        });
      }
    }

    return [...imageItems, ...refItems, ...elementItems];
  }, [pendingImages, t, supportsElements, supportsMediaReferences, menuState.mode, menuState.videoParams?.kling_elements, menuState.videoParams?.media_references, resolveElementImageUrl, resolveMediaRefImageUrl, resolveMediaRefVideoUrl, resolveMediaRefAudioUrl]);

  // Resolve element image IDs to display URLs using the parent's resolver or pending images
  const resolveElementImageUrlLocal = useCallback(
    (imageId: string) => {
      return resolveElementImageUrl?.(imageId) ?? pendingImages.find((img) => img.imageId === imageId)?.url;
    },
    [resolveElementImageUrl, pendingImages]
  );

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
    setIsDraggingExternalFile(false);
    try {
      // First: check for internal asset drag (custom MIME type)
      const json = e.dataTransfer.getData(ASSET_DRAG_MIME);
      if (json) {
        const parsed = JSON.parse(json);
        if (parsed?.assetId) {
          onAssetDrop(parsed);
          return;
        }
      }
      const fallbackId = e.dataTransfer.getData("text/plain");
      if (fallbackId && !e.dataTransfer.files.length) {
        onAssetDrop({ assetId: fallbackId });
        return;
      }
    } catch (err) {
      console.error("Failed to parse dropped asset", err);
    }

    // Second: check for dropped files (external file drag)
    if (e.dataTransfer.files.length > 0) {
      const allowedTypes = [
        ...siteConfig.upload.allowedImageTypes,
        ...siteConfig.upload.allowedVideoTypes,
        ...siteConfig.upload.allowedAudioTypes,
      ];
      const validFiles: File[] = [];
      let hasInvalid = false;
      for (const file of Array.from(e.dataTransfer.files)) {
        if (allowedTypes.includes(file.type)) {
          validFiles.push(file);
        } else {
          hasInvalid = true;
        }
      }
      if (hasInvalid) {
        addToast({ title: t("chat.invalidImageType"), color: "warning" });
      }
      if (validFiles.length > 0) {
        onFilesUpload(validFiles);
      }
    }
  };

  // Handle paste: extract image/video/audio data from clipboard
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const allowedTypes = [
        ...siteConfig.upload.allowedImageTypes,
        ...siteConfig.upload.allowedVideoTypes,
        ...siteConfig.upload.allowedAudioTypes,
      ];
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && allowedTypes.includes(item.type)) {
          const file = item.getAsFile();
          if (file) {
            files.push(
              new File(
                [file],
                `${t("chat.pastedImage")}.${file.type.split("/")[1]}`,
                { type: file.type }
              )
            );
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        onFilesUpload(files);
      }
    },
    [onFilesUpload, t]
  );

  // Global drag listeners: detect when an external file enters the browser window
  // and show a drop-zone overlay scoped near the chat input.
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      e.dataTransfer?.types?.includes("Files") ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setIsDraggingExternalFile(true);
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDraggingExternalFile(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      dragCounterRef.current = 0;
      setIsDraggingExternalFile(false);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      dragCounterRef.current = 0;
    };
  }, []);

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

        // Don't collapse if the asset picker modal is open
        if (isAssetPickerOpen) {
          return;
        }

        // Don't collapse if there's text in the input or pending images
        if (input.trim().length > 0 || pendingImages.length > 0) {
          return;
        }

        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRecording, isTranscribing, input, pendingImages.length, isAssetPickerOpen]);

  // Auto-expand if there are attachments, recording, or video mode
  useEffect(() => {
    if (pendingImages.length > 0 || pendingVideos.length > 0 || pendingAudios.length > 0 || isRecording || menuState.mode === "video") {
      setIsExpanded(true);
    }
  }, [pendingImages.length, pendingVideos.length, pendingAudios.length, isRecording, menuState.mode]);

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

  // The file-drop overlay. When dropOverlayContainer is provided, it is
  // portaled into that element and uses absolute positioning so it scopes to
  // the chat panel rather than the entire viewport. Otherwise it covers the
  // full viewport (default behavior on chat-only pages).
  const dropOverlay = (
    <AnimatePresence>
      {isDraggingExternalFile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={clsx(
            "z-60 pointer-events-auto",
            dropOverlayContainer ? "absolute inset-0" : "fixed inset-0"
          )}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDrop(e);
          }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-8 px-4">
            <div className="w-full max-w-2xl rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-md p-8 flex flex-col items-center gap-2 shadow-xl">
              <Upload size={36} className="text-primary" />
              <span className="text-lg font-semibold text-primary">
                {t("chat.dropZoneTitle")}
              </span>
              <span className="text-sm text-default-500">
                {t("chat.dropZoneSubtitle", { maxSize: siteConfig.upload.maxFileSizeMB })}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="absolute bottom-4 left-0 right-0 z-30 md:z-50 flex justify-center px-4 pointer-events-none">
      {dropOverlayContainer
        ? createPortal(dropOverlay, dropOverlayContainer)
        : dropOverlay}

      <div
        ref={containerRef}
        onPaste={handlePaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          maxWidth: isExpanded ? "48rem" : "320px",
          width: "100%",
        }}
        className="bg-background/80 backdrop-blur-md rounded-2xl border border-divider shadow-lg pointer-events-auto overflow-hidden transition-[max-width] duration-300 ease-out"
      >
        <div className="flex flex-col">
          {/* Video Frames Area - shows frame slots in video mode */}
          <AnimatePresence>
            {isExpanded && menuState.mode === "video" && (videoModelHasImageParams || assetParamSlots.length > 0) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-4 overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Video size={12} className="text-default-500" />
                  <span className="text-xs text-default-500">{t("chat.videoSourceImages")}</span>
                </div>
                <div className="flex gap-3 mb-2">
                  {/* Source frame slot - only when model has imageParams */}
                  {videoModelHasImageParams && (
                    <AssetDropTarget
                      onAssetDrop={(payload) => onDropOnSourceFrame?.(payload)}
                      disabled={!onDropOnSourceFrame}
                      className="w-fit"
                    >
                  {pendingImages[0] ? (
                    <div className="relative w-fit group">
                      <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative">
                        <img
                          src={
                            (pendingImages[0].isUploading || pendingImages[0].isCompressing) && pendingImages[0].localPreviewUrl
                              ? pendingImages[0].localPreviewUrl
                              : pendingImages[0].url
                          }
                          alt={pendingImages[0].title || t("chat.image")}
                          className={clsx(
                            "w-full h-full object-cover",
                            (pendingImages[0].isUploading || pendingImages[0].isCompressing) && "opacity-50"
                          )}
                        />
                        {pendingImages[0].isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Spinner size="sm" color="white" />
                          </div>
                        )}
                        {pendingImages[0].isCompressing && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 gap-1">
                            <Spinner size="sm" color="white" />
                            <span className="text-[9px] text-white/90">{t("chat.compressing")}</span>
                          </div>
                        )}
                        {!pendingImages[0].isUploading && !pendingImages[0].isCompressing && (
                          <div className="absolute top-1 left-1 z-10">
                            <span className="text-[9px] font-semibold bg-warning/90 text-warning-foreground px-1.5 py-0.5 rounded">
                              {t("chat.videoSourceLabel")}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemovePendingImage(pendingImages[0].imageId);
                        }}
                        disabled={pendingImages[0].isUploading || pendingImages[0].isCompressing}
                        className={clsx(
                          "absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-10",
                          pendingImages[0].isUploading || pendingImages[0].isCompressing
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-default-200"
                        )}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={onOpenAssetPicker}
                      className="h-20 w-20 rounded-lg border-2 border-dashed border-default-300 hover:border-warning hover:bg-warning/5 flex flex-col items-center justify-center transition-colors gap-1"
                    >
                      <ImagePlus size={18} className="text-default-400" />
                      <span className="text-[9px] text-default-400 text-center leading-tight px-1">
                        {t("chat.videoAddSource")}
                      </span>
                    </button>
                  )}
                    </AssetDropTarget>
                  )}

                  {/* End frame slot - only when model supports it */}
                  {videoModelSupportsEndImage && (
                    <AssetDropTarget
                      onAssetDrop={(payload) => onDropOnEndFrame?.(payload)}
                      disabled={!onDropOnEndFrame}
                      className="w-fit"
                    >
                      {pendingImages[1] ? (
                        <div className="relative w-fit group">
                          <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative">
                            <img
                              src={
                                (pendingImages[1].isUploading || pendingImages[1].isCompressing) && pendingImages[1].localPreviewUrl
                                  ? pendingImages[1].localPreviewUrl
                                  : pendingImages[1].url
                              }
                              alt={pendingImages[1].title || t("chat.image")}
                              className={clsx(
                                "w-full h-full object-cover",
                                (pendingImages[1].isUploading || pendingImages[1].isCompressing) && "opacity-50"
                              )}
                            />
                            {pendingImages[1].isUploading && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Spinner size="sm" color="white" />
                              </div>
                            )}
                            {pendingImages[1].isCompressing && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 gap-1">
                                <Spinner size="sm" color="white" />
                                <span className="text-[9px] text-white/90">{t("chat.compressing")}</span>
                              </div>
                            )}
                            {!pendingImages[1].isUploading && !pendingImages[1].isCompressing && (
                              <div className="absolute top-1 left-1 z-10">
                                <span className="text-[9px] font-semibold bg-warning/90 text-warning-foreground px-1.5 py-0.5 rounded">
                                  {t("chat.videoEndLabel")}
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemovePendingImage(pendingImages[1].imageId);
                            }}
                            disabled={pendingImages[1].isUploading || pendingImages[1].isCompressing}
                            className={clsx(
                              "absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-10",
                              pendingImages[1].isUploading || pendingImages[1].isCompressing
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:bg-default-200"
                            )}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={onOpenAssetPicker}
                          className="h-20 w-20 rounded-lg border-2 border-dashed border-default-300 hover:border-warning hover:bg-warning/5 flex flex-col items-center justify-center transition-colors gap-1"
                        >
                          <ImagePlus size={18} className="text-default-400" />
                          <span className="text-[9px] text-default-400 text-center leading-tight px-1">
                            {t("chat.videoAddEnd")}
                          </span>
                        </button>
                      )}
                    </AssetDropTarget>
                  )}

                  {/* Asset param slots for type: "asset" params */}
                  {assetParamSlots.map((slot) => {
                    const val = assetParamValues[slot.name];
                    const inner = val ? (
                      <div className="relative w-fit group">
                        <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative">
                          <img
                            src={val.displayUrl}
                            alt={slot.label}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-1 left-1 z-10">
                            <span className="text-[9px] font-semibold bg-primary/90 text-primary-foreground px-1.5 py-0.5 rounded">
                              {slot.label}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onClearAssetParam?.(slot.name);
                          }}
                          className="absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-10 hover:bg-default-200"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onOpenAssetParamPicker?.(slot.name)}
                        className="h-20 w-20 rounded-lg border-2 border-dashed border-default-300 hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center transition-colors gap-1"
                      >
                        <ImagePlus size={18} className="text-default-400" />
                        <span className="text-[9px] text-default-400 text-center leading-tight px-1">
                          {slot.label}
                        </span>
                        {!slot.required && (
                          <span className="text-[8px] text-default-300">{t("common.optional")}</span>
                        )}
                      </button>
                    );
                    return (
                      <AssetDropTarget
                        key={slot.name}
                        onAssetDrop={(payload) =>
                          onDropOnAssetParam?.(slot.name, payload)
                        }
                        disabled={!onDropOnAssetParam}
                        className="w-fit"
                      >
                        {inner}
                      </AssetDropTarget>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Suggested images from previous message */}
          <AnimatePresence>
            {suggestedImages.length > 0 && pendingImages.length === 0 && menuState.mode !== "video" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-3 overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-dashed border-default-300 bg-default-50 dark:bg-default-50/5">
                  <div className="flex gap-1.5 shrink-0">
                    {suggestedImages.slice(0, 3).map((img) => (
                      <div
                        key={img.imageId}
                        className="h-10 w-10 rounded border border-divider overflow-hidden shrink-0"
                      >
                        <img
                          src={img.url}
                          alt={img.title || t("chat.image")}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {suggestedImages.length > 3 && (
                      <div className="h-10 w-10 rounded border border-divider flex items-center justify-center bg-default-100 text-default-500 text-xs">
                        +{suggestedImages.length - 3}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <span className="text-xs text-default-500 flex-1 min-w-0">
                      {t("chat.suggestedImageLabel")}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="light"
                        onPress={onDismissSuggestedImages}
                      >
                        <X size={14} />
                      </Button>
                      <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        onPress={onConfirmSuggestedImages}
                      >
                        {t("chat.suggestedImageConfirm")}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Previews Area - Pending images display (non-video modes) */}
          <AnimatePresence>
            {isExpanded && menuState.mode !== "video" && pendingImages.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-4 overflow-hidden"
              >
                <div className="flex gap-2 flex-wrap mb-2">
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
                              handleImageClick(img.imageId, img.isUploading || img.isCompressing || false);
                            }}
                          >
                            {/* Image with loading overlay if uploading or compressing */}
                            <img
                              src={
                                (img.isUploading || img.isCompressing) && img.localPreviewUrl
                                  ? img.localPreviewUrl
                                  : img.url
                              }
                              alt={img.title || t("chat.image")}
                              className={clsx(
                                "w-full h-full object-cover",
                                (img.isUploading || img.isCompressing) && "opacity-50"
                              )}
                            />

                            {/* Uploading spinner overlay */}
                            {img.isUploading && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Spinner size="sm" color="white" />
                              </div>
                            )}

                            {/* Compressing spinner overlay */}
                            {img.isCompressing && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 gap-1">
                                <Spinner size="sm" color="white" />
                                <span className="text-[9px] text-white/90">{t("chat.compressing")}</span>
                              </div>
                            )}

                            {/* Source indicator and title overlay */}
                            {!img.isUploading && !img.isCompressing && (
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
                                    (img.isUploading || img.isCompressing) && img.localPreviewUrl
                                      ? img.localPreviewUrl
                                      : img.url
                                  }
                                  alt={img.title || t("chat.image")}
                                  className="max-w-[min(600px,calc(100vw-3rem))] max-h-[600px] object-contain"
                                />

                                {/* Drawing button overlay - only show when not uploading/compressing and feature flag enabled */}
                                {!img.isUploading && !img.isCompressing && showCircleToEdit && (
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
                            disabled={img.isUploading || img.isCompressing}
                            className={clsx(
                              "absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-10",
                              img.isUploading || img.isCompressing
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
                      const isUploading = markedImage.isUploading || markedImage.isCompressing || originalImage.isUploading || originalImage.isCompressing;

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
                                (originalImage.isUploading || originalImage.isCompressing) && originalImage.localPreviewUrl
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
                              handleImageClick(markedImage.imageId, markedImage.isUploading || markedImage.isCompressing || false);
                            }}
                          >
                            <img
                              src={
                                (markedImage.isUploading || markedImage.isCompressing) && markedImage.localPreviewUrl
                                  ? markedImage.localPreviewUrl
                                  : markedImage.url
                              }
                              alt={markedImage.title || t("chat.image")}
                              className={clsx(
                                "w-full h-full object-cover",
                                (markedImage.isUploading || markedImage.isCompressing) && "opacity-50"
                              )}
                            />

                            {/* Uploading spinner overlay */}
                            {markedImage.isUploading && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Spinner size="sm" color="white" />
                              </div>
                            )}

                            {/* Compressing spinner overlay */}
                            {markedImage.isCompressing && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 gap-1">
                                <Spinner size="sm" color="white" />
                                <span className="text-[9px] text-white/90">{t("chat.compressing")}</span>
                              </div>
                            )}

                            {/* Marked label overlay */}
                            {!markedImage.isUploading && !markedImage.isCompressing && (
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
                                        (markedImage.isUploading || markedImage.isCompressing) && markedImage.localPreviewUrl
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

          {/* Pending Videos Area */}
          <AnimatePresence>
            {isExpanded && menuState.mode !== "video" && pendingVideos.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-2 overflow-hidden"
              >
                <div className="flex gap-2 flex-wrap mb-2">
                  {pendingVideos.map((vid) => (
                    <div key={vid.videoId} className="relative w-fit group">
                      <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative bg-black">
                        {vid.isUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Spinner size="sm" color="white" />
                          </div>
                        ) : (
                          <video
                            src={vid.localPreviewUrl || vid.url}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        )}
                        <div className="absolute top-1 left-1 z-10">
                          <span className="text-[9px] font-semibold bg-danger/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Video size={8} />
                            {t("chat.videoLabel")}
                          </span>
                        </div>
                        {!vid.isUploading && vid.title && (
                          <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent flex flex-col justify-end p-1">
                            <span className="text-white text-[10px] leading-tight font-medium line-clamp-1">
                              {vid.title}
                            </span>
                          </div>
                        )}
                      </div>
                      {onRemovePendingVideo && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemovePendingVideo(vid.videoId);
                          }}
                          disabled={vid.isUploading}
                          className={clsx(
                            "absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-10",
                            vid.isUploading ? "opacity-50 cursor-not-allowed" : "hover:bg-default-200"
                          )}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pending Audios Area */}
          <AnimatePresence>
            {isExpanded && pendingAudios.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-2 overflow-hidden"
              >
                <div className="flex gap-2 flex-wrap mb-2">
                  {pendingAudios.map((aud) => (
                    <div key={aud.audioId} className="relative w-fit group">
                      <div className="h-20 w-40 rounded-lg border border-divider overflow-hidden relative bg-secondary/10 flex items-center justify-center gap-2 px-3">
                        {aud.isUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                            <Spinner size="sm" />
                          </div>
                        ) : (
                          <>
                            <Music size={20} className="text-secondary shrink-0" />
                            <span className="text-xs text-default-700 line-clamp-2 leading-tight">
                              {aud.title || "Audio"}
                            </span>
                          </>
                        )}
                        <div className="absolute top-1 left-1 z-10">
                          <span className="text-[9px] font-semibold bg-secondary/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Music size={8} />
                            {t("chat.audioLabel")}
                          </span>
                        </div>
                      </div>
                      {onRemovePendingAudio && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemovePendingAudio(aud.audioId);
                          }}
                          disabled={aud.isUploading}
                          className={clsx(
                            "absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider z-10",
                            aud.isUploading ? "opacity-50 cursor-not-allowed" : "hover:bg-default-200"
                          )}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Row */}
          <div className={clsx("flex items-center p-2", isExpanded && "gap-2")}>
            <div
              className={clsx(
                "flex gap-1 items-center overflow-hidden transition-[width,opacity] duration-300 shrink-0",
                stackLeftButtons ? "flex-col" : "flex-row",
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

            <div ref={textareaContainerRef} className="flex-1 min-w-0">
              <MentionTextbox
                ref={mentionTextboxRef}
                value={input}
                onChange={handleMentionChange}
                mentionItems={mentionItems}
                placeholder={menuState.mode === "image" || menuState.mode === "video" ? t("chat.typePrompt") : t("chat.typeMessage")}
                minRows={1}
                maxRows={isExpanded ? 10 : 1}
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
                className="bg-transparent"
                renderDropdownItem={(item, isHighlighted) => (
                  <ImageChipDropdownItem item={item} isHighlighted={isHighlighted} />
                )}
                t={(key) => t(`mention.${key}`)}
              />
            </div>

            <Tooltip
              content={
                hasUploadingImages
                  ? t("chat.waitForUpload")
                  : klingElementsInvalid
                    ? t("chat.klingElementsInvalid")
                    : mediaRefVideoOverCap
                      ? t("chat.referenceVideoOverCap", { max: 15 })
                      : ""
              }
              isDisabled={!hasUploadingImages && !klingElementsInvalid && !mediaRefVideoOverCap}
            >
              {isSending ? (
                <Button
                  key="stop-generation"
                  isIconOnly
                  color="danger"
                  aria-label={t("chat.stopGenerating")}
                  onPress={onStop}
                  className="shrink-0"
                >
                  <Square size={20} />
                </Button>
              ) : menuState.mode === "video" ? (
                <Button
                  key="send-video"
                  color="warning"
                  aria-label={t("chat.send")}
                  onPress={onSend}
                  isLoading={isSending}
                  isDisabled={isRecording || isTranscribing || hasUploadingImages || klingElementsInvalid || mediaRefVideoOverCap || (videoModelHasImageParams ? pendingImages.length === 0 : !input.trim())}
                  className="shrink-0"
                  size="sm"
                >
                  <Send size={16} />
                  {isExpanded && !videoCostLoading && videoCost !== null && videoCost !== undefined && (
                    <span className="flex items-center gap-0.5 font-semibold ml-1">
                      <Bean size={14} />
                      {videoCost.toLocaleString()}
                    </span>
                  )}
                  {isExpanded && videoCostLoading && <Spinner size="sm" />}
                </Button>
              ) : menuState.mode === "image" && isExpanded && (imageCost !== null || imageCostLoading) ? (
                <Button
                  key="send-image"
                  color="secondary"
                  aria-label={t("chat.send")}
                  onPress={onSend}
                  isLoading={isSending}
                  isDisabled={isRecording || isTranscribing || hasUploadingImages}
                  className="shrink-0"
                  size="sm"
                >
                  <Send size={16} />
                  {!imageCostLoading && imageCost !== null && imageCost !== undefined && (
                    <span className="flex items-center gap-0.5 font-semibold ml-1">
                      <Bean size={14} />
                      {imageCost.toLocaleString()}
                    </span>
                  )}
                  {imageCostLoading && <Spinner size="sm" />}
                </Button>
              ) : (
                <Button
                  key="send-default"
                  isIconOnly
                  color={menuState.mode === "image" ? "secondary" : "primary"}
                  aria-label={t("chat.send")}
                  onPress={onSend}
                  isLoading={isSending}
                  isDisabled={isRecording || isTranscribing || hasUploadingImages}
                  className="shrink-0"
                >
                  <Send size={20} />
                </Button>
              )}
            </Tooltip>
          </div>

          {/* Multi-Shot Editor (above menu bar in video mode) */}
          <AnimatePresence>
            {isExpanded && menuState.mode === "video" &&
              videoModelParams.some((p) => p.type === "multi_prompt") &&
              menuState.videoParams?.multi_shots && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-2 py-1.5 border-t border-divider">
                  <MultiShotEditor
                    shots={(menuState.videoParams?.multi_prompt as MultiPromptShot[]) || []}
                    onChange={(shots) =>
                      onMenuStateChange({
                        ...menuState,
                        videoParams: {
                          ...menuState.videoParams,
                          multi_prompt: shots,
                        },
                      })
                    }
                    compact
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Kling Element Editor (above menu bar in video mode) */}
          <AnimatePresence>
            {isExpanded && menuState.mode === "video" &&
              videoModelParams.some((p) => p.type === "kling_elements") && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-2 py-1.5 border-t border-divider">
                  <KlingElementEditor
                    elements={(menuState.videoParams?.kling_elements as KlingElement[]) || []}
                    onChange={(elements) =>
                      onMenuStateChange({
                        ...menuState,
                        videoParams: {
                          ...menuState.videoParams,
                          kling_elements: elements,
                        },
                      })
                    }
                    onPickImages={onPickElementImages}
                    resolveImageUrl={resolveElementImageUrlLocal}
                    isAssetPickerOpen={isAssetPickerOpen}
                    compact
                    variant={klingElementVariant}
                    onPickFromLibrary={onPickLibraryElement}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Seedance Reference Editor (above menu bar in video mode) */}
          <AnimatePresence>
            {isExpanded && menuState.mode === "video" &&
              videoModelParams.some((p) => p.type === "media_references") && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <AssetDropTarget
                  onAssetDrop={(payload) => onDropOnMediaReference?.(payload)}
                  disabled={!onDropOnMediaReference}
                  className="px-2 py-1.5 border-t border-divider"
                  activeClassName="ring-2 ring-inset ring-primary"
                >
                  <SeedanceReferenceEditor
                    references={(menuState.videoParams?.media_references as MediaReference[]) || []}
                    onChange={(refs) =>
                      onMenuStateChange({
                        ...menuState,
                        videoParams: {
                          ...menuState.videoParams,
                          media_references: refs,
                        },
                      })
                    }
                    onPickImage={onPickMediaRefImage}
                    onPickVideo={onPickMediaRefVideo}
                    onPickAudio={onPickMediaRefAudio}
                    resolveImageUrl={resolveMediaRefImageUrl}
                    resolveVideoUrl={resolveMediaRefVideoUrl}
                    resolveAudioUrl={resolveMediaRefAudioUrl}
                    videoDurations={mediaRefVideoDurations}
                    {...(menuState.videoModelId === "kling-o3-reference"
                      ? { maxImages: 4, maxVideos: 0, maxAudios: 0 }
                      : menuState.videoModelId === "kling-v3-omni"
                        ? { maxImages: 4, maxVideos: 1, maxAudios: 0 }
                        : {})}
                  />
                </AssetDropTarget>
              </motion.div>
            )}
          </AnimatePresence>

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
                    imageUnitCost={imageUnitCost}
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
