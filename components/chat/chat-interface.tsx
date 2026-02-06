"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { useDisclosure } from "@heroui/modal";
import { Card, CardBody } from "@heroui/card";
import { addToast } from "@heroui/toast";
import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import {
  NotificationPermissionModal,
  NotificationPermissionModalRef,
} from "@/components/notification-permission-modal";
import { Message, MessageContentPart } from "@/lib/llm/types";
import ImageDetailModal, { ImageInfo } from "./image-detail-modal";
import ImageDrawingModal from "./image-drawing-modal";
import ChatMessage from "./chat-message";
import ChatInput, { ChatInputRef } from "./chat-input";
import ParallelMessage from "./parallel-message";
import AssetPickerModal, { type AssetSummary } from "./asset-picker-modal";
import { siteConfig } from "@/config/site";
import { useVoiceRecorder } from "./use-voice-recorder";
import { SYSTEM_PROMPT_STORAGE_KEY } from "@/components/test-kit";
import {
  MenuState,
  INITIAL_MENU_STATE,
  resolveMenuState,
  loadMenuState,
  saveMenuState,
} from "./menu-configuration";
import {
  PendingImage,
  MAX_PENDING_IMAGES,
  canAddImage,
  hasUploadingImages,
} from "./pending-image-types";
import {
  uploadImage,
  validateFile,
  getMaxFileSizeMB,
} from "@/lib/upload/client";
import {
  saveChatDraft,
  loadChatDraft,
  clearChatDraft,
  draftImagesToPendingImages,
  ChatDraft,
} from "./draft-utils";
import {
  ReferenceImage,
  ReferenceImageTag,
  MAX_REFERENCE_IMAGES,
  canAddReferenceImage,
} from "./reference-image-types";
import {
  saveReferenceImages,
  loadReferenceImages,
  saveReferenceImagesCollapsed,
  loadReferenceImagesCollapsed,
} from "./reference-image-utils";
import { getPreselectImages } from "./preselect-images-utils";
import type { JSONContent } from "@tiptap/react";

// Helper to group consecutive assistant messages with the same timestamp as variants
interface MessageGroup {
  type: "user" | "assistant";
  messages: Message[];
  originalIndex: number; // Index of the first message in this group
}

interface ChatInterfaceProps {
  chatId?: string;
  initialMessages?: Message[];
  /** If true, this instance won't update the activeChatId in localStorage (used in side panel) */
  disableActiveChatPersistence?: boolean;
  /** Callback when a new chat is created (chatId is assigned) */
  onChatCreated?: (chatId: string) => void;
  /** Force compact mode for message display (swipeable variants instead of side-by-side) */
  compactMode?: boolean;
  /** Hide avatars for both user and assistant messages */
  hideAvatars?: boolean;
}

export default function ChatInterface({
  chatId: initialChatId,
  initialMessages = [],
  disableActiveChatPersistence = false,
  onChatCreated,
  compactMode = false,
  hideAvatars = false,
}: ChatInterfaceProps) {
  const t = useTranslations();
  const { user } = useAuth();
  const { monitorChat, cancelMonitorChat } = useChat();
  const router = useRouter();
  const [chatId, setChatId] = useState<string | undefined>(initialChatId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(
    !!initialChatId && initialMessages.length === 0
  );
  const [isSending, setIsSending] = useState(false);
  // Track which message timestamp is currently generating an additional variant
  const [generatingVariantTimestamp, setGeneratingVariantTimestamp] = useState<
    number | null
  >(null);
  // Unified pending images array - replaces selectedFile, previewUrl, selectedAsset, selectedAgentPart
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  // Track which picker mode is active: "pending" for regular images, "reference" for reference images
  const [assetPickerMode, setAssetPickerMode] = useState<"pending" | "reference">("pending");
  const [precisionEditing, setPrecisionEditing] = useState(false);
  
  // Reference images state - persistent images that don't get cleared on send
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isReferenceImagesCollapsed, setIsReferenceImagesCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return loadReferenceImagesCollapsed();
    }
    return false;
  });
  const [menuState, setMenuState] = useState<MenuState>(() => {
    // Load saved preferences from localStorage on mount
    if (typeof window !== "undefined") {
      return loadMenuState();
    }
    return INITIAL_MENU_STATE;
  });

  // Drawing modal state for "circle to change" feature (局部重绘)
  const [drawingImage, setDrawingImage] = useState<{
    imageId: string;
    url: string;
    title?: string;
  } | null>(null);

  // Ref to ChatInput for getting editor content
  const chatInputRef = useRef<ChatInputRef>(null);

  // Draft state - loaded once on mount or when chatId changes
  const [loadedDraft, setLoadedDraft] = useState<ChatDraft | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [prevChatId, setPrevChatId] = useState(chatId);
  // Track if draft had images - used to skip pre-select when draft takes priority
  const [draftHadImages, setDraftHadImages] = useState(false);

  // Reset draft loaded state when chatId changes
  if (chatId !== prevChatId) {
    setPrevChatId(chatId);
    setIsDraftLoaded(false);
    setLoadedDraft(null);
    setDraftHadImages(false);
  }

  // Load draft on mount or when chatId changes
  useEffect(() => {
    if (isDraftLoaded) return;
    
    const draft = loadChatDraft(chatId);
    if (draft) {
      setLoadedDraft(draft);
      setInput(draft.plainText);
      // Restore pending images from draft
      if (draft.pendingImages.length > 0) {
        setPendingImages(draftImagesToPendingImages(draft.pendingImages));
        setDraftHadImages(true); // Mark that draft had images (skip pre-select)
      }
    } else {
      setInput("");
      // Don't clear pendingImages here - they might be set from other sources
    }
    setIsDraftLoaded(true);
  }, [chatId, isDraftLoaded]);

  // Load reference images on mount or when chatId changes (separate from draft)
  useEffect(() => {
    const loaded = loadReferenceImages(chatId);
    setReferenceImages(loaded);
  }, [chatId]);

  // Save reference images when they change
  useEffect(() => {
    saveReferenceImages(chatId, referenceImages);
  }, [chatId, referenceImages]);

  // Save collapsed state when it changes
  useEffect(() => {
    saveReferenceImagesCollapsed(isReferenceImagesCollapsed);
  }, [isReferenceImagesCollapsed]);

  // Track previous isSending state to detect when AI response completes
  const prevIsSendingRef = useRef(isSending);
  
  // Pre-select images refs (useEffects are defined after applyPreselectImages)
  const hasAppliedInitialPreselect = useRef(false);

  // Save draft function - called on blur and visibility change
  const saveDraft = useCallback(() => {
    if (!isDraftLoaded) return;
    
    const editorContent = chatInputRef.current?.getEditorJSON() || null;
    saveChatDraft(chatId, editorContent, input, pendingImages);
  }, [chatId, input, pendingImages, isDraftLoaded]);

  // Save draft on visibility change (tab switch, minimize, etc.)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveDraft();
      }
    };

    const handleBeforeUnload = () => {
      saveDraft();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveDraft]);

  // Listen for reset-chat event (triggered when clicking New Chat button while technically already on /chat)
  useEffect(() => {
    const handleReset = () => {
      setChatId(undefined);
      setMessages([]);
      setInput("");
      // Clean up any local preview URLs before clearing
      pendingImages.forEach((img) => {
        if (img.localPreviewUrl) URL.revokeObjectURL(img.localPreviewUrl);
      });
      setPendingImages([]);
      setPrecisionEditing(false);
      setIsSending(false);
      setLoadedDraft(null);
      setIsDraftLoaded(false);
      setDraftHadImages(false);

      // Clear the draft for new chat
      clearChatDraft(undefined);
    };

    window.addEventListener("reset-chat", handleReset);
    return () => window.removeEventListener("reset-chat", handleReset);
  }, [pendingImages]);

  // Save menu state to localStorage when it changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveMenuState(menuState);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [menuState]);

  // Modal state for agent images
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [allImages, setAllImages] = useState<ImageInfo[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Group messages for rendering (group assistant variants together)
  const groupedMessages = useMemo((): MessageGroup[] => {
    const groups: MessageGroup[] = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i];

      if (msg.role === "user") {
        groups.push({
          type: "user",
          messages: [msg],
          originalIndex: i,
        });
        i++;
      } else if (msg.role === "assistant") {
        // Collect all consecutive assistant messages with the same createdAt timestamp
        // These are parallel variants
        const variants: Message[] = [msg];
        const timestamp = msg.createdAt;
        let j = i + 1;

        while (j < messages.length) {
          const nextMsg = messages[j];
          if (
            nextMsg.role === "assistant" &&
            nextMsg.createdAt === timestamp &&
            nextMsg.variantId // Must have variantId to be considered a variant
          ) {
            variants.push(nextMsg);
            j++;
          } else {
            break;
          }
        }

        groups.push({
          type: "assistant",
          messages: variants,
          originalIndex: i,
        });
        i = j;
      } else {
        i++;
      }
    }

    return groups;
  }, [messages]);

  // Collect all images from messages
  const collectAllImages = useCallback((): ImageInfo[] => {
    const images: ImageInfo[] = [];
    for (const message of messages) {
      if (message.role === "assistant" && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (
            part.type === "agent_image" &&
            (part.status === "generated" || part.status === "error")
          ) {
            images.push({
              url: part.imageUrl || "",
              title: part.title,
              prompt: part.prompt,
              imageId: part.imageId,
              status: part.status,
            });
          }
        }
      }
    }
    return images;
  }, [messages]);

  // Helper to check if there are any AI-generated images selected
  const selectedAgentImages = useMemo(
    () => pendingImages.filter((img) => img.source === "ai_generated"),
    [pendingImages]
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const notificationModalRef = useRef<NotificationPermissionModalRef>(null);
  const lastUserInputRef = useRef<string>("");

  // Voice recorder hook
  const handleTranscriptionComplete = useCallback((text: string) => {
    // Insert the transcribed text into the rich text editor via ref
    // The editor's onUpdate callback will automatically sync the input state
    if (chatInputRef.current) {
      chatInputRef.current.insertText(text);
    }
  }, []);

  const {
    isRecording,
    isTranscribing,
    recordingTime,
    startRecording,
    stopRecording,
  } = useVoiceRecorder({
    onTranscriptionComplete: handleTranscriptionComplete,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const fetchChat = async () => {
      if (!chatId) return;
      if (messages.length > 0) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch(`/api/chat/${chatId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages);
          // Pre-select images from the last user message on page load
          applyPreselectImages(data.messages);
        }
      } catch (error) {
        console.error("Failed to fetch chat", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user && chatId) {
      fetchChat();
    } else {
      setIsLoading(false);
    }
  }, [chatId, user]);

  // Persist active chat ID for cross-page continuity
  // Use "new" as a special marker for new chat state (no chatId yet)
  // Skip if disableActiveChatPersistence is true (used in side panel where parent controls this)
  useEffect(() => {
    if (disableActiveChatPersistence) return;

    if (chatId) {
      localStorage.setItem(siteConfig.activeChatId, chatId);
    } else {
      // Mark as "new chat" state so side panel knows to show fresh chat
      localStorage.setItem(siteConfig.activeChatId, "new");
    }
  }, [chatId, disableActiveChatPersistence]);

  // Upload a file using presigned URL (bypasses Vercel's 4.5MB limit)
  const uploadAndAddImage = useCallback(
    async (file: File) => {
      // Validate file before upload
      const validationError = validateFile(file);
      if (validationError) {
        addToast({
          title:
            validationError.code === "FILE_TOO_LARGE"
              ? t("chat.fileSizeTooLarge", { maxSize: getMaxFileSizeMB() })
              : t("chat.uploadFailed"),
          color: "danger",
        });
        return;
      }

      if (!canAddImage(pendingImages)) {
        addToast({
          title: t("chat.maxImagesReached", { max: MAX_PENDING_IMAGES }),
          color: "warning",
        });
        return;
      }

      // Create a temporary ID for tracking during upload
      const tempId = `uploading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const localPreviewUrl = URL.createObjectURL(file);

      // Add placeholder to pending images with uploading state
      const uploadingImage: PendingImage = {
        imageId: tempId,
        url: localPreviewUrl,
        source: "upload",
        title: file.name,
        isUploading: true,
        localPreviewUrl,
      };

      setPendingImages((prev) => [...prev, uploadingImage]);

      const result = await uploadImage(file);

      if (result.success) {
        // Update the pending image with the real ID and URL
        setPendingImages((prev) =>
          prev.map((img) =>
            img.imageId === tempId
              ? {
                ...img,
                imageId: result.data.imageId,
                url: result.data.imageUrl,
                isUploading: false,
                localPreviewUrl: undefined,
              }
              : img
          )
        );
        URL.revokeObjectURL(localPreviewUrl);
      } else {
        console.error("Image upload failed:", result.error);
        // Remove the failed upload from pending images
        setPendingImages((prev) =>
          prev.filter((img) => img.imageId !== tempId)
        );
        URL.revokeObjectURL(localPreviewUrl);

        addToast({
          title: t("chat.uploadFailed"),
          color: "danger",
        });
      }
    },
    [pendingImages, t]
  );

  // Remove a pending image by its imageId
  const removePendingImage = useCallback(
    (imageId: string) => {
      setPendingImages((prev) => {
        const img = prev.find((i) => i.imageId === imageId);
        if (img?.localPreviewUrl) {
          URL.revokeObjectURL(img.localPreviewUrl);
        }
        const newImages = prev.filter((i) => i.imageId !== imageId);

        // If in "edit" mode and no images remain, switch to "create" mode
        if (menuState.mode === "edit" && newImages.length === 0) {
          const newState = resolveMenuState(menuState, "create");
          setMenuState(newState);
        }

        return newImages;
      });
    },
    [menuState]
  );

  // Add an asset from the library to pending images
  const addAssetImage = useCallback(
    (asset: {
      assetId: string;
      imageId: string;
      url: string;
      title: string;
    }) => {
      if (!canAddImage(pendingImages)) {
        addToast({
          title: t("chat.maxImagesReached", { max: MAX_PENDING_IMAGES }),
          color: "warning",
        });
        return;
      }

      // Check if this image is already in the pending list
      if (pendingImages.some((img) => img.imageId === asset.imageId)) {
        addToast({
          title: t("chat.imageAlreadyAdded"),
          color: "warning",
        });
        return;
      }

      const newImage: PendingImage = {
        imageId: asset.imageId,
        url: asset.url,
        source: "asset",
        title: asset.title,
      };

      setPendingImages((prev) => [...prev, newImage]);
    },
    [pendingImages, t]
  );

  // Add an AI-generated image to pending images
  const addAgentImage = useCallback(
    (image: {
      imageId: string;
      url: string;
      title: string;
      messageIndex: number;
      partIndex: number;
      variantId?: string;
    }) => {
      if (!canAddImage(pendingImages)) {
        addToast({
          title: t("chat.maxImagesReached", { max: MAX_PENDING_IMAGES }),
          color: "warning",
        });
        return;
      }

      // Check if this image is already in the pending list
      if (pendingImages.some((img) => img.imageId === image.imageId)) {
        // Toggle off - remove if already selected
        removePendingImage(image.imageId);
        return;
      }

      const newImage: PendingImage = {
        imageId: image.imageId,
        url: image.url,
        source: "ai_generated",
        title: image.title,
        messageIndex: image.messageIndex,
        partIndex: image.partIndex,
        variantId: image.variantId,
      };

      setPendingImages((prev) => [...prev, newImage]);
    },
    [pendingImages, t, removePendingImage]
  );

  // Add a reference image
  const addReferenceImage = useCallback(
    (asset: {
      imageId: string;
      url: string;
      title?: string;
    }, tag: ReferenceImageTag = "none") => {
      if (!canAddReferenceImage(referenceImages)) {
        addToast({
          title: t("chat.maxImagesReached", { max: MAX_REFERENCE_IMAGES }),
          color: "warning",
        });
        return;
      }

      // Check if this image is already in the reference list
      if (referenceImages.some((img) => img.imageId === asset.imageId)) {
        addToast({
          title: t("chat.imageAlreadyAdded"),
          color: "warning",
        });
        return;
      }

      const newImage: ReferenceImage = {
        imageId: asset.imageId,
        url: asset.url,
        title: asset.title,
        tag,
      };

      setReferenceImages((prev) => [...prev, newImage]);
    },
    [referenceImages, t]
  );

  // Remove a reference image
  const removeReferenceImage = useCallback((imageId: string) => {
    setReferenceImages((prev) => prev.filter((img) => img.imageId !== imageId));
  }, []);

  // Update a reference image's tag
  const updateReferenceImageTag = useCallback((imageId: string, tag: ReferenceImageTag) => {
    setReferenceImages((prev) =>
      prev.map((img) =>
        img.imageId === imageId ? { ...img, tag } : img
      )
    );
  }, []);

  // Toggle reference images collapsed state
  const toggleReferenceImagesCollapsed = useCallback(() => {
    setIsReferenceImagesCollapsed((prev) => !prev);
  }, []);

  // Pre-select images from the last user message with images
  // This helps users who want to continue editing the same images
  // Skip if draft had images (draft takes priority over system pre-select)
  const applyPreselectImages = useCallback((msgs: Message[]) => {
    // Skip pre-select if draft had images (draft takes priority)
    if (draftHadImages) {
      return;
    }
    
    const preselectedImages = getPreselectImages(msgs);
    if (preselectedImages.length > 0) {
      setPendingImages(preselectedImages);
    }
  }, [draftHadImages]);

  // Pre-select images after AI response completes
  useEffect(() => {
    // Detect transition from sending (true) to not sending (false)
    if (prevIsSendingRef.current && !isSending) {
      // AI response just completed, pre-select images from the last user message
      applyPreselectImages(messages);
    }
    prevIsSendingRef.current = isSending;
  }, [isSending, messages, applyPreselectImages]);

  // Pre-select images when initialMessages are provided (component mount with pre-loaded messages)
  useEffect(() => {
    if (!hasAppliedInitialPreselect.current && initialMessages.length > 0 && !isLoading) {
      applyPreselectImages(initialMessages);
      hasAppliedInitialPreselect.current = true;
    }
  }, [initialMessages, isLoading, applyPreselectImages]);

  // Open asset picker for reference images
  const openReferenceImagePicker = useCallback(() => {
    setAssetPickerMode("reference");
    setIsAssetPickerOpen(true);
  }, []);

  // Open asset picker for pending images
  const openPendingImagePicker = useCallback(() => {
    setAssetPickerMode("pending");
    setIsAssetPickerOpen(true);
  }, []);

  // Upload a file and add to reference images
  const uploadAndAddReferenceImage = useCallback(
    async (file: File) => {
      // Validate file before upload
      const validationError = validateFile(file);
      if (validationError) {
        addToast({
          title:
            validationError.code === "FILE_TOO_LARGE"
              ? t("chat.fileSizeTooLarge", { maxSize: getMaxFileSizeMB() })
              : t("chat.uploadFailed"),
          color: "danger",
        });
        return;
      }

      if (!canAddReferenceImage(referenceImages)) {
        addToast({
          title: t("chat.maxImagesReached", { max: MAX_REFERENCE_IMAGES }),
          color: "warning",
        });
        return;
      }

      const result = await uploadImage(file);

      if (result.success) {
        // Add to reference images with default tag
        const newImage: ReferenceImage = {
          imageId: result.data.imageId,
          url: result.data.imageUrl,
          title: file.name,
          tag: "subject",
        };
        setReferenceImages((prev) => [...prev, newImage]);
      } else {
        console.error("Reference image upload failed:", result.error);
        addToast({
          title: t("chat.uploadFailed"),
          color: "danger",
        });
      }
    },
    [referenceImages, t]
  );

  // Get the appropriate upload handler based on asset picker mode
  const handleAssetUpload = useCallback(
    async (file: File) => {
      if (assetPickerMode === "reference") {
        await uploadAndAddReferenceImage(file);
      } else {
        await uploadAndAddImage(file);
      }
    },
    [assetPickerMode, uploadAndAddImage, uploadAndAddReferenceImage]
  );

  // Listen for asset selection events from the hover sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      const d = ce.detail as any;
      if (!d?.assetId || !d?.url || !d?.imageId) return;
      addAssetImage({
        assetId: d.assetId,
        url: d.url,
        title: d.title || "Selected asset",
        imageId: d.imageId,
      });
    };
    window.addEventListener("moodio-asset-selected", handler as any);
    return () =>
      window.removeEventListener("moodio-asset-selected", handler as any);
  }, [addAssetImage]);

  const handleAssetDrop = useCallback(
    async (payload: any) => {
      if (payload?.assetId && payload?.url && payload?.imageId) {
        addAssetImage({
          assetId: payload.assetId,
          url: payload.url,
          title: payload.title || t("chat.selectedAsset"),
          imageId: payload.imageId,
        });
        return;
      }

      if (payload?.assetId && typeof payload.assetId === "string") {
        try {
          const res = await fetch(`/api/assets/${payload.assetId}`);
          if (!res.ok) return;
          const data = await res.json();
          const a = data.asset;
          if (!a?.id || !a?.imageUrl || !a?.imageId) return;
          addAssetImage({
            assetId: a.id,
            url: a.imageUrl,
            title: a.generationDetails?.title || t("chat.selectedAsset"),
            imageId: a.imageId,
          });
        } catch (e) {
          console.error("Failed to load dropped asset", e);
        }
      }
    },
    [addAssetImage, t]
  );

  const handleAssetPicked = useCallback(
    (asset: AssetSummary) => {
      if (assetPickerMode === "reference") {
        // Add to reference images with default tag "subject"
        addReferenceImage({
          imageId: asset.imageId,
          url: asset.imageUrl,
          title: asset.generationDetails?.title || t("chat.selectedAsset"),
        }, "subject");
      } else {
        // Add to pending images
        addAssetImage({
          assetId: asset.id,
          url: asset.imageUrl,
          title: asset.generationDetails?.title || t("chat.selectedAsset"),
          imageId: asset.imageId,
        });
      }
    },
    [addAssetImage, addReferenceImage, assetPickerMode, t]
  );

  // Handler to open drawing modal for an image
  const handleDrawImage = useCallback(
    (imageId: string, imageUrl: string, imageTitle?: string) => {
      setDrawingImage({ imageId, url: imageUrl, title: imageTitle });
    },
    []
  );

  // Handler to save marked image from drawing modal
  const handleSaveMarkedImage = useCallback(
    async (file: File, originalImageId: string) => {
      // Find the original image to get its title
      const originalImage = pendingImages.find(
        (img) => img.imageId === originalImageId
      );
      const originalTitle = originalImage?.title || t("chat.image");

      // Check if there's an existing marked image for this original (redraw case)
      const existingMarkedImage = pendingImages.find(
        (img) => img.markedFromImageId === originalImageId
      );

      // Validate file before upload
      const validationError = validateFile(file);
      if (validationError) {
        addToast({
          title:
            validationError.code === "FILE_TOO_LARGE"
              ? t("chat.fileSizeTooLarge", { maxSize: getMaxFileSizeMB() })
              : t("chat.uploadFailed"),
          color: "danger",
        });
        return;
      }

      // Check image limit - but if we're replacing an existing marked image, don't count it
      const effectivePendingImages = existingMarkedImage
        ? pendingImages.filter((img) => img.imageId !== existingMarkedImage.imageId)
        : pendingImages;

      if (!canAddImage(effectivePendingImages)) {
        addToast({
          title: t("chat.maxImagesReached", { max: MAX_PENDING_IMAGES }),
          color: "warning",
        });
        return;
      }

      // Create a temporary ID for tracking during upload
      const tempId = `uploading-marked-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const localPreviewUrl = URL.createObjectURL(file);

      // Add placeholder to pending images with uploading state
      const uploadingImage: PendingImage = {
        imageId: tempId,
        url: localPreviewUrl,
        source: "upload",
        title: t("chat.markedImage", { title: originalTitle }),
        isUploading: true,
        localPreviewUrl,
        markedFromImageId: originalImageId,
      };

      // Remove existing marked image (if redrawing) and add new one
      setPendingImages((prev) => {
        let newImages = prev;

        // Remove the old marked image if it exists
        if (existingMarkedImage) {
          // Clean up the old preview URL if any
          if (existingMarkedImage.localPreviewUrl) {
            URL.revokeObjectURL(existingMarkedImage.localPreviewUrl);
          }
          newImages = newImages.filter(
            (img) => img.imageId !== existingMarkedImage.imageId
          );
        }

        return [...newImages, uploadingImage];
      });

      const result = await uploadImage(file, { skipCollection: true });

      if (result.success) {
        // Update the pending image with the real ID and URL
        setPendingImages((prev) =>
          prev.map((img) =>
            img.imageId === tempId
              ? {
                ...img,
                imageId: result.data.imageId,
                url: result.data.imageUrl,
                isUploading: false,
                localPreviewUrl: undefined,
              }
              : img
          )
        );
        URL.revokeObjectURL(localPreviewUrl);

        // Auto-enable precision editing when user creates a marked image
        setPrecisionEditing(true);

        // Auto-switch to edit mode if in create mode
        if (menuState.mode === "create") {
          const newState = resolveMenuState(menuState, "edit");
          setMenuState(newState);
        }
      } else {
        console.error("Marked image upload failed:", result.error);
        // Remove the failed upload from pending images
        setPendingImages((prev) =>
          prev.filter((img) => img.imageId !== tempId)
        );
        URL.revokeObjectURL(localPreviewUrl);

        addToast({
          title: t("chat.uploadFailed"),
          color: "danger",
        });
      }
    },
    [pendingImages, t, menuState]
  );

  // Close drawing modal
  const handleDrawingModalClose = useCallback(() => {
    setDrawingImage(null);
  }, []);

  const handleSend = async () => {
    // Block send if uploading images or no content
    if (hasUploadingImages(pendingImages)) {
      addToast({
        title: t("chat.waitForUpload"),
        color: "warning",
      });
      return;
    }

    if (
      (!input.trim() && pendingImages.length === 0) ||
      isSending ||
      isRecording ||
      isTranscribing
    )
      return;

    // Build the message content with selected image titles
    let currentInput = input;
    const agentImages = pendingImages.filter(
      (img) => img.source === "ai_generated"
    );
    if (agentImages.length > 0) {
      const titles = agentImages.map((img) => img.title || "image").join(", ");
      const prefix = `I select ${titles}`;
      currentInput = currentInput ? `${prefix}\n\n${currentInput}` : prefix;
    }

    // Save the original input for potential retry exhausted scenario
    lastUserInputRef.current = input;

    // Capture current pending images before clearing
    const currentPendingImages = [...pendingImages];

    // Build optimistic message content with image metadata for display and pre-select
    const optimisticContent: Message["content"] =
      currentPendingImages.length > 0
        ? (() => {
          const parts: MessageContentPart[] = [];
          if (currentInput) {
            parts.push({ type: "text", text: currentInput });
          }
          // Add images to the optimistic content with full metadata
          // This ensures pre-select works correctly after AI response
          for (const img of currentPendingImages) {
            parts.push({
              type: "image",
              imageId: img.imageId,
              imageUrl: img.url,
              source: img.source,
              title: img.title,
            });
          }
          return parts;
        })()
        : currentInput;

    const userMessage: Message = {
      role: "user",
      content: optimisticContent,
      createdAt: Date.now(),
    };

    // Optimistically update previous messages to mark selected agent images
    const agentImageSelections = currentPendingImages.filter(
      (img) => img.source === "ai_generated" && img.messageIndex !== undefined
    );

    if (agentImageSelections.length > 0) {
      setMessages((prev) => {
        const newMessages = [...prev];

        for (const selection of agentImageSelections) {
          // Find the correct message
          let msgIndex = selection.messageIndex!;
          if (selection.variantId) {
            const variantIndex = newMessages.findIndex(
              (m) => m.variantId === selection.variantId
            );
            if (variantIndex !== -1) {
              msgIndex = variantIndex;
            }
          }

          if (newMessages[msgIndex]) {
            const msg = newMessages[msgIndex];
            if (Array.isArray(msg.content)) {
              const newContent = [...msg.content];
              // Find the part by imageId
              const imgIndex = newContent.findIndex(
                (p) =>
                  p.type === "agent_image" && p.imageId === selection.imageId
              );
              if (
                imgIndex !== -1 &&
                newContent[imgIndex].type === "agent_image"
              ) {
                const agentImagePart = newContent[imgIndex] as Extract<
                  MessageContentPart,
                  { type: "agent_image" }
                >;
                newContent[imgIndex] = {
                  ...agentImagePart,
                  isSelected: true,
                };
                newMessages[msgIndex] = { ...msg, content: newContent };
              }
            }
          }
        }
        return [...newMessages, userMessage];
      });
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }

    // Clear input and pending images
    setInput("");
    // Clean up local preview URLs
    currentPendingImages.forEach((img) => {
      if (img.localPreviewUrl) URL.revokeObjectURL(img.localPreviewUrl);
    });
    setPendingImages([]);
    setPrecisionEditing(false);
    
    // Clear the draft since we're sending the message
    clearChatDraft(chatId);
    // Reset draftHadImages so pre-select can work after AI response
    setDraftHadImages(false);

    setIsSending(true);

    try {
      // Check for notification permission when user sends a message
      notificationModalRef.current?.checkPermission();

      let currentChatId = chatId;

      if (!currentChatId) {
        const createRes = await fetch("/api/chat", { method: "POST" });
        if (!createRes.ok) throw new Error("Failed to create chat");
        const createData = await createRes.json();
        currentChatId = createData.chat.id as string;
        setChatId(currentChatId);
        window.history.replaceState(null, "", `/chat/${currentChatId}`);
        window.dispatchEvent(new Event("refresh-chats"));
        // Persist active chat ID for cross-page continuity (unless disabled)
        if (!disableActiveChatPersistence) {
          localStorage.setItem(siteConfig.activeChatId, currentChatId);
        }
        // Notify parent of new chat creation
        onChatCreated?.(currentChatId);
      }

      // Start monitoring for background completion (in case user leaves)
      if (currentChatId) {
        monitorChat(currentChatId, messages.length + 1);
      }

      // Build the unified JSON payload with imageIds array
      const payload: any = {
        content: currentInput,
        // Send all image IDs as unified array
        imageIds: currentPendingImages.map((img) => img.imageId),
        // Include source metadata for each image
        imageSources: currentPendingImages.map((img) => ({
          imageId: img.imageId,
          source: img.source,
          title: img.title,
          messageIndex: img.messageIndex,
          partIndex: img.partIndex,
          variantId: img.variantId,
        })),
        // Include reference images with their tags
        referenceImages: referenceImages.map((img) => ({
          imageId: img.imageId,
          tag: img.tag,
          title: img.title,
        })),
      };

      if (menuState.mode === "create" || menuState.mode === "edit") {
        payload.imageModelId = menuState.model;
        if (menuState.imageSize) {
          payload.imageSize = menuState.imageSize;
        }
      }

      // Add precision editing flag if enabled
      if (precisionEditing) {
        payload.precisionEditing = true;
      }

      // Pass aspect ratio if not "smart" (let agent decide)
      if (menuState.aspectRatio && menuState.aspectRatio !== "smart") {
        payload.aspectRatio = menuState.aspectRatio;
      }

      // Check for system prompt override
      const overrideEnabled =
        localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY + "_enabled") === "true";
      if (overrideEnabled) {
        const overridePrompt = localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY);
        if (overridePrompt) {
          payload.systemPromptOverride = overridePrompt;
        }
      }

      const res = await fetch(`/api/chat/${currentChatId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to send message");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let isFirstChunkByVariant: Record<string, boolean> = {};
      let hasInitializedVariants = false;

      // Temporary storage for the message content parts per variant
      const variantContents: Record<string, MessageContentPart[]> = {};
      // Will be set from backend's message_timestamp event
      let variantTimestamp: number | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            // Handle message_timestamp event from backend (sync timestamp)
            if (event.type === "message_timestamp") {
              variantTimestamp = event.timestamp;
              continue;
            }

            const variantId = event.variantId || "default";

            // Initialize variant tracking if needed
            if (!variantContents[variantId]) {
              variantContents[variantId] = [];
              isFirstChunkByVariant[variantId] = true;
            }

            if (event.type === "invalidate") {
              // LLM is being retried for this variant - clear its content
              console.log(
                `[Chat] Received invalidate signal for variant ${variantId} - clearing for retry`
              );

              // Show a cute toast notification (only once per retry cycle)
              if (Object.keys(variantContents).length <= 1) {
                const cuteMessages = [
                  t("chat.retryMessages.rethink"),
                  t("chat.retryMessages.rephrase"),
                  t("chat.retryMessages.organizing"),
                  t("chat.retryMessages.better"),
                  t("chat.retryMessages.sparkle"),
                ];
                const randomMessage =
                  cuteMessages[Math.floor(Math.random() * cuteMessages.length)];

                addToast({
                  title: randomMessage,
                  color: "primary",
                });
              }

              variantContents[variantId] = [];
              isFirstChunkByVariant[variantId] = true;

              // Update the messages state to clear this variant
              setMessages((prev) => {
                const newMessages = [...prev];
                // Find and update the variant message
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  const msg = newMessages[i];
                  if (msg.role === "assistant" && msg.variantId === variantId) {
                    newMessages[i] = { ...msg, content: [] };
                    break;
                  }
                }
                return newMessages;
              });
              continue;
            }

            if (
              event.type === "retry_exhausted" ||
              event.type === "variant_failed"
            ) {
              // This variant failed - log but continue with other variants
              console.log(
                `[Chat] Variant ${variantId} failed: ${event.reason}`
              );

              // If all variants failed, handle the error
              const allFailed = Object.keys(variantContents).every(
                (v) => variantContents[v].length === 0
              );

              if (
                allFailed &&
                Object.keys(variantContents).length >= 1
              ) {
                // Cancel chat monitoring since all requests failed
                if (currentChatId) {
                  cancelMonitorChat(currentChatId);
                }

                // Show error toast
                const cuteErrorMessages = [
                  t("chat.errorMessages.overwhelmed"),
                  t("chat.errorMessages.coffeeBreak"),
                  t("chat.errorMessages.tripped"),
                ];
                const randomErrorMessage =
                  cuteErrorMessages[
                  Math.floor(Math.random() * cuteErrorMessages.length)
                  ];

                addToast({
                  title: randomErrorMessage,
                  color: "danger",
                });

                // Restore the user's original input
                setInput(lastUserInputRef.current);

                // Remove all variant messages and user message
                setMessages((prev) => {
                  return prev.filter(
                    (msg) =>
                      !(
                        msg.role === "assistant" &&
                        msg.createdAt === variantTimestamp
                      ) && !(msg.role === "user" && msg === userMessage)
                  );
                });
              }
              continue;
            }

            // Initialize variant message if this is the first chunk for this variant
            if (isFirstChunkByVariant[variantId]) {
              // Use backend timestamp, fallback to current time if not received yet
              const timestamp = variantTimestamp || Date.now();
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: [],
                  createdAt: timestamp,
                  variantId: variantId,
                },
              ]);
              isFirstChunkByVariant[variantId] = false;
              hasInitializedVariants = true;
            }

            const currentContent = variantContents[variantId];

            if (event.type === "internal_think") {
              // Add internal_think part
              currentContent.push({
                type: "internal_think",
                text: event.content,
              });
            } else if (event.type === "text") {
              // Append text to the first part if it's text, or create new
              if (
                currentContent.length === 0 ||
                currentContent[0].type !== "text"
              ) {
                variantContents[variantId] = [
                  { type: "text", text: event.content },
                  ...currentContent,
                ];
              } else {
                currentContent[0] = { type: "text", text: event.content };
              }
            } else if (event.type === "part") {
              // Add new part
              currentContent.push(event.part);
            } else if (event.type === "part_update") {
              // Update existing part by imageId (for parallel support)
              if (event.imageId) {
                // Find the part with matching imageId
                const partIdx = currentContent.findIndex(
                  (p) => p.type === "agent_image" && p.imageId === event.imageId
                );
                if (partIdx !== -1) {
                  currentContent[partIdx] = event.part;
                }
              } else if (event.index !== undefined) {
                // Legacy: Update by index (backward compatibility)
                const hasThink = currentContent.some(
                  (p) => p.type === "internal_think"
                );
                const offset = hasThink ? 2 : 1;
                if (currentContent[event.index + offset]) {
                  currentContent[event.index + offset] = event.part;
                }
              }
            }

            // Update the specific variant message
            setMessages((prev) => {
              const newMessages = [...prev];
              // Find the variant message to update
              for (let i = newMessages.length - 1; i >= 0; i--) {
                const msg = newMessages[i];
                if (msg.role === "assistant" && msg.variantId === variantId) {
                  newMessages[i] = {
                    ...msg,
                    content: [...variantContents[variantId]],
                  };
                  break;
                }
              }
              return newMessages;
            });
          } catch (e) {
            console.error("Parse error", e);
          }
        }
      }

      if (messages.length <= 1) {
        setTimeout(() => {
          window.dispatchEvent(new Event("refresh-chats"));
        }, 3000);
      }
    } catch (error) {
      console.error("Error sending message", error);
    } finally {
      setIsSending(false);
    }
  };

  // Handle precision editing toggle - auto-switch mode to "edit" when enabled
  const handlePrecisionEditingChange = useCallback(
    (value: boolean) => {
      setPrecisionEditing(value);
      // When precision editing is turned ON and mode is "create", switch to "edit"
      if (value && menuState.mode === "create") {
        const newState = resolveMenuState(menuState, "edit");
        setMenuState(newState);
      }
    },
    [menuState]
  );

  // Handle menu state change - auto-enable precision editing when switching to edit mode
  const handleMenuStateChange = useCallback(
    (newState: MenuState) => {
      setMenuState(newState);
      // Auto-enable precision editing when switching to edit mode
      if (newState.mode === "edit") {
        setPrecisionEditing(true);
      }
    },
    []
  );

  const handleAgentTitleClick = (part: any) => {
    if (part.status === "generated" || part.status === "error") {
      const images = collectAllImages();
      const url = part.imageUrl || "";
      const index = images.findIndex((img) => img.url === url);

      setAllImages(images);
      setCurrentImageIndex(index >= 0 ? index : 0);
      setSelectedImage({
        url, // Use CloudFront URL from API (access via signed cookies)
        title: part.title,
        prompt: part.prompt,
        imageId: part.imageId,
        status: part.status,
      });
      onOpen();
    }
  };

  const handleUserImageClick = (images: ImageInfo[], index: number) => {
    if (!images.length || index < 0 || index >= images.length) return;
    setAllImages(images);
    setCurrentImageIndex(index);
    setSelectedImage(images[index]);
    onOpen();
  };

  const handleImageNavigate = useCallback(
    (index: number) => {
      if (index >= 0 && index < allImages.length) {
        setCurrentImageIndex(index);
        setSelectedImage(allImages[index]);
      }
    },
    [allImages]
  );

  const handleAgentImageSelect = (
    part: any,
    messageIndex: number,
    partIndex: number,
    variantId?: string
  ) => {
    if (part.status === "generated" && part.imageId) {
      const url = part.imageUrl || "";
      // Use addAgentImage which handles toggle logic internally
      addAgentImage({
        imageId: part.imageId,
        url,
        title: part.title,
        messageIndex,
        partIndex,
        variantId,
      });
    }
  };

  const handleForkChat = async (messageIndex: number) => {
    if (!chatId) return;

    try {
      const res = await fetch(`/api/chat/${chatId}/fork`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageIndex }),
      });

      if (!res.ok) {
        throw new Error("Failed to fork chat");
      }

      const data = await res.json();
      const newChatId = data.chatId;
      const originalMessage = data.originalMessage;

      // Save draft for new chat using the new draft system
      let content = "";
      if (typeof originalMessage.content === "string") {
        content = originalMessage.content;
      } else if (Array.isArray(originalMessage.content)) {
        // Extract text parts
        content = originalMessage.content
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n");
      }
      // Save as a simple text draft (no editor content or images for forked chats)
      saveChatDraft(newChatId, null, content, []);

      // Trigger chat refresh
      window.dispatchEvent(new Event("refresh-chats"));

      // Redirect to new chat
      router.push(`/chat/${newChatId}`);
    } catch (error) {
      console.error("Error forking chat:", error);
      addToast({
        title: t("chat.failedToForkChat"),
        color: "danger",
      });
    }
  };

  // Handler for generating an additional variant for a message group
  const handleGenerateVariant = async (messageTimestamp: number) => {
    if (!chatId || generatingVariantTimestamp !== null) return;

    setGeneratingVariantTimestamp(messageTimestamp);

    try {
      const res = await fetch(`/api/chat/${chatId}/variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageTimestamp }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to generate variant");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let isFirstChunk = true;
      let variantContent: MessageContentPart[] = [];
      let newVariantId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            // Skip message_timestamp event (used for main message sync, not needed here)
            if (event.type === "message_timestamp") {
              continue;
            }

            const variantId = event.variantId || "default";

            // Track the variant ID
            if (!newVariantId) {
              newVariantId = variantId;
            }

            if (event.type === "invalidate") {
              // Retry - clear content
              variantContent = [];
              isFirstChunk = true;
              continue;
            }

            if (
              event.type === "retry_exhausted" ||
              event.type === "variant_failed"
            ) {
              console.log(`[Chat] Variant generation failed: ${event.reason}`);
              continue;
            }

            // Initialize the new variant message on first chunk
            if (isFirstChunk) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: [],
                  createdAt: messageTimestamp,
                  variantId: variantId,
                },
              ]);
              isFirstChunk = false;
            }

            // Process content events
            if (event.type === "internal_think") {
              // Add internal_think part
              variantContent.push({
                type: "internal_think",
                text: event.content,
              });
            } else if (event.type === "text") {
              if (
                variantContent.length === 0 ||
                variantContent[0].type !== "text"
              ) {
                variantContent = [
                  { type: "text", text: event.content },
                  ...variantContent,
                ];
              } else {
                variantContent[0] = { type: "text", text: event.content };
              }
            } else if (event.type === "part") {
              variantContent.push(event.part);
            } else if (event.type === "part_update") {
              // Update existing part by imageId
              if (event.imageId) {
                const partIdx = variantContent.findIndex(
                  (p) => p.type === "agent_image" && p.imageId === event.imageId
                );
                if (partIdx !== -1) {
                  variantContent[partIdx] = event.part;
                }
              } else if (event.index !== undefined) {
                // Legacy: Update by index (backward compatibility)
                const hasThink = variantContent.some(
                  (p) => p.type === "internal_think"
                );
                const offset = hasThink ? 2 : 1;
                if (variantContent[event.index + offset]) {
                  variantContent[event.index + offset] = event.part;
                }
              }
            }

            // Update the message in state
            setMessages((prev) => {
              const newMessages = [...prev];
              for (let i = newMessages.length - 1; i >= 0; i--) {
                const msg = newMessages[i];
                if (
                  msg.role === "assistant" &&
                  msg.variantId === variantId &&
                  msg.createdAt === messageTimestamp
                ) {
                  newMessages[i] = { ...msg, content: [...variantContent] };
                  break;
                }
              }
              return newMessages;
            });
          } catch (e) {
            console.error("Parse error in variant stream", e);
          }
        }
      }

      addToast({
        title: t("chat.variantGenerated"),
        color: "success",
      });
    } catch (error) {
      console.error("Error generating variant:", error);
      addToast({
        title: t("chat.failedToGenerateVariant"),
        color: "danger",
      });
    } finally {
      setGeneratingVariantTimestamp(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto space-y-6 pb-24 pr-2 pt-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="text-center text-default-500 mt-60">
            <Bot size={48} className="mx-auto mb-4 opacity-20" />
            <p>{t("chat.startConversation")}</p>
          </div>
        )}

        {groupedMessages.map((group, groupIdx) => {
          if (group.type === "user") {
            return (
              <ChatMessage
                key={`user-${group.originalIndex}`}
                message={group.messages[0]}
                messageIndex={group.originalIndex}
                chatId={chatId}
                user={user}
                selectedImageIds={pendingImages.map((img) => img.imageId)}
                onAgentImageSelect={handleAgentImageSelect}
                onAgentTitleClick={handleAgentTitleClick}
                onUserImageClick={handleUserImageClick}
                onForkChat={handleForkChat}
                hideAvatar={hideAvatars}
              />
            );
          } else {
            // Assistant message(s) - use ParallelMessage for variants
            const messageTimestamp = group.messages[0]?.createdAt;
            // Only show "New Idea" button on the last assistant message group
            const isLastAssistantGroup =
              groupIdx === groupedMessages.length - 1 ||
              (groupIdx === groupedMessages.length - 2 &&
                groupedMessages[groupedMessages.length - 1]?.type === "user");
            return (
              <ParallelMessage
                key={`assistant-${group.originalIndex}`}
                variants={group.messages}
                messageIndex={group.originalIndex}
                chatId={chatId}
                user={user}
                selectedImageIds={pendingImages.map((img) => img.imageId)}
                onAgentImageSelect={handleAgentImageSelect}
                onAgentTitleClick={handleAgentTitleClick}
                onForkChat={handleForkChat}
                compactMode={compactMode}
                hideAvatars={hideAvatars}
                onGenerateVariant={
                  isLastAssistantGroup && messageTimestamp
                    ? () => handleGenerateVariant(messageTimestamp)
                    : undefined
                }
                isGeneratingVariant={
                  generatingVariantTimestamp === messageTimestamp
                }
                isSending={isSending}
              />
            );
          }
        })}

        {isSending &&
          groupedMessages.length > 0 &&
          groupedMessages[groupedMessages.length - 1]?.type === "user" && (
            <div className="flex gap-3 max-w-3xl mx-auto justify-start items-center">
              {!hideAvatars && (
                <div className="hidden md:flex w-8 h-8 rounded-full bg-primary/10 items-center justify-center shrink-0">
                  <Bot size={16} className="text-primary" />
                </div>
              )}
              <Card className="max-w-full md:max-w-[80%] shadow-none bg-default-100 dark:bg-default-50/10">
                <CardBody className="px-4 pt-[2px] pb-1 overflow-hidden flex justify-center">
                  <Spinner variant="dots" size="md" />
                </CardBody>
              </Card>
            </div>
          )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        ref={chatInputRef}
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        isSending={isSending}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        recordingTime={recordingTime}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        pendingImages={pendingImages}
        onRemovePendingImage={removePendingImage}
        onOpenAssetPicker={openPendingImagePicker}
        onAssetDrop={handleAssetDrop}
        showFileUpload={true}
        precisionEditing={precisionEditing}
        onPrecisionEditingChange={handlePrecisionEditingChange}
        onDrawImage={handleDrawImage}
        menuState={menuState}
        onMenuStateChange={handleMenuStateChange}
        hasUploadingImages={hasUploadingImages(pendingImages)}
        initialEditorContent={loadedDraft?.editorContent || (loadedDraft?.plainText ? loadedDraft.plainText : undefined)}
        onBlur={saveDraft}
        referenceImages={referenceImages}
        onAddReferenceImage={openReferenceImagePicker}
        onRemoveReferenceImage={removeReferenceImage}
        onUpdateReferenceImageTag={updateReferenceImageTag}
        isReferenceImagesCollapsed={isReferenceImagesCollapsed}
        onToggleReferenceImagesCollapsed={toggleReferenceImagesCollapsed}
      />

      <AssetPickerModal
        isOpen={isAssetPickerOpen}
        onOpenChange={() => setIsAssetPickerOpen((v) => !v)}
        onSelect={handleAssetPicked}
        onUpload={handleAssetUpload}
      />

      <ImageDetailModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        selectedImage={selectedImage}
        allImages={allImages}
        currentIndex={currentImageIndex}
        onNavigate={handleImageNavigate}
        onClose={onClose}
        chatId={chatId}
      />

      {/* Drawing modal for "circle to change" feature (局部重绘) */}
      {drawingImage && (
        <ImageDrawingModal
          isOpen={!!drawingImage}
          onClose={handleDrawingModalClose}
          imageUrl={drawingImage.url}
          imageId={drawingImage.imageId}
          imageTitle={drawingImage.title}
          onSaveMarkedImage={handleSaveMarkedImage}
        />
      )}

      <NotificationPermissionModal ref={notificationModalRef} />
    </div>
  );
}
