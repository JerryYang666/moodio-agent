"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { useCredits } from "@/hooks/use-credits";
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
import { Message, MessageContentPart, isGeneratedImagePart } from "@/lib/llm/types";
import { getVideoModel } from "@/lib/video/models";
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
  loadMenuState,
  saveMenuState,
  resolveMenuState,
} from "./menu-configuration";
import {
  PendingImage,
  MAX_PENDING_IMAGES,
  canAddImage,
  hasUploadingImages,
} from "./pending-image-types";
import type { VideoRestoreData } from "@/components/video/video-detail-modal";
import {
  uploadImage,
  validateFile,
  getMaxFileSizeMB,
  shouldCompressFile,
  getCompressThresholdMB,
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
import { useResearchTelemetry } from "@/hooks/use-research-telemetry";

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
  /** Desktop ID for linking video assets to desktop */
  desktopId?: string;
}

export default function ChatInterface({
  chatId: initialChatId,
  initialMessages = [],
  disableActiveChatPersistence = false,
  onChatCreated,
  compactMode = false,
  hideAvatars = false,
  desktopId,
}: ChatInterfaceProps) {
  const t = useTranslations();
  const { user } = useAuth();
  const { refreshBalance } = useCredits();
  const { monitorChat, cancelMonitorChat } = useChat();
  const router = useRouter();
  const { track: trackResearch, beacon: beaconResearch, enabled: researchEnabled } = useResearchTelemetry();
  const [chatId, setChatId] = useState<string | undefined>(initialChatId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(
    !!initialChatId && initialMessages.length === 0
  );

  // Extract chatId from the URL pathname. This is the source of truth because
  // replaceState (used after creating a new chat) bypasses Next.js routing, so
  // the prop may be stale after back/forward navigation.
  const getChatIdFromUrl = useCallback(() => {
    const match = window.location.pathname.match(/^\/chat\/(.+)$/);
    return match ? match[1] : undefined;
  }, []);

  // On mount + popstate (browser back/forward): reconcile internal chatId with URL.
  useEffect(() => {
    const syncWithUrl = () => {
      const urlChatId = getChatIdFromUrl();
      console.log(
        `[ChatInterface] URL sync — url: ${window.location.pathname}, urlChatId: ${urlChatId ?? "none"}, current chatId: ${chatId ?? "none"}`
      );
      if (urlChatId && urlChatId !== chatId) {
        console.log(`[ChatInterface] Syncing chatId to "${urlChatId}" from URL`);
        setChatId(urlChatId);
        setMessages([]);
        setIsLoading(true);
      }
    };

    syncWithUrl();

    window.addEventListener("popstate", syncWithUrl);
    return () => window.removeEventListener("popstate", syncWithUrl);
  }, [chatId, getChatIdFromUrl]);

  // Keep internal chatId in sync with the URL-derived prop (covers normal
  // Next.js navigations where the prop updates correctly).
  useEffect(() => {
    if (initialChatId !== chatId) {
      console.log(
        `[ChatInterface] Prop sync — initialChatId: ${initialChatId ?? "none"}, current chatId: ${chatId ?? "none"}`
      );
      setChatId(initialChatId);
      setMessages(initialMessages);
      setIsLoading(!!initialChatId && initialMessages.length === 0);
    }
  }, [initialChatId]);
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
  const [menuState, setMenuState] = useState<MenuState>(INITIAL_MENU_STATE);

  // Load saved menu state from localStorage after hydration
  const menuStateInitialized = useRef(false);
  useEffect(() => {
    if (menuStateInitialized.current) return;
    menuStateInitialized.current = true;
    const saved = loadMenuState();
    setMenuState(saved);
  }, []);

  // Video cost estimation state
  const [videoCost, setVideoCost] = useState<number | null>(null);
  const [videoCostLoading, setVideoCostLoading] = useState(false);

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

  // Save draft on visibility change (tab switch, minimize, etc.) + research session_end
  useEffect(() => {
    const sendSessionEnd = (trigger: "page_leave" | "inactivity") => {
      if (sessionEndSentRef.current || !chatId || sessionTurnCountRef.current === 0) return;
      sessionEndSentRef.current = true;
      const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
      beaconResearch({
        chatId,
        eventType: "session_end",
        metadata: {
          turns: sessionTurnCountRef.current,
          durationSeconds,
          trigger,
        },
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveDraft();
      }
    };

    const handleBeforeUnload = () => {
      saveDraft();
      sendSessionEnd("page_leave");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveDraft, chatId, beaconResearch]);

  // Research telemetry: reset session tracking when chatId changes
  useEffect(() => {
    sessionStartRef.current = Date.now();
    sessionTurnCountRef.current = 0;
    sessionEndSentRef.current = false;
  }, [chatId]);

  // Research telemetry: inactivity timeout for session_end
  useEffect(() => {
    if (!researchEnabled || !chatId) return;

    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        if (!sessionEndSentRef.current && sessionTurnCountRef.current > 0) {
          sessionEndSentRef.current = true;
          const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
          trackResearch({
            chatId,
            eventType: "session_end",
            metadata: {
              turns: sessionTurnCountRef.current,
              durationSeconds,
              trigger: "inactivity",
            },
          });
        }
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => document.addEventListener(e, resetInactivityTimer, { passive: true }));
    resetInactivityTimer();

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetInactivityTimer));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [researchEnabled, chatId, trackResearch]);

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

  // Video cost estimation
  const videoCostParams = useMemo(() => {
    if (menuState.mode !== "video" || !menuState.videoModelId) return null;
    const entries = Object.entries(menuState.videoParams)
      .filter(([key, value]) => key !== "prompt" && value !== undefined && value !== null && value !== "")
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  }, [menuState.mode, menuState.videoModelId, menuState.videoParams]);

  useEffect(() => {
    if (menuState.mode !== "video" || !menuState.videoModelId) {
      setVideoCost(null);
      return;
    }
    const fetchCost = async () => {
      setVideoCostLoading(true);
      try {
        const searchParams = new URLSearchParams();
        searchParams.set("modelId", menuState.videoModelId);
        Object.entries(menuState.videoParams).forEach(([key, value]) => {
          if (key !== "prompt" && value !== undefined && value !== null && value !== "") {
            searchParams.set(key, String(value));
          }
        });
        const res = await fetch(`/api/video/cost?${searchParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setVideoCost(data.cost);
        }
      } catch (e) {
        console.error("Failed to fetch video cost:", e);
      } finally {
        setVideoCostLoading(false);
      }
    };
    const timeoutId = setTimeout(fetchCost, 300);
    return () => clearTimeout(timeoutId);
  }, [menuState.videoModelId, videoCostParams]);

  // Check if current video model supports end images
  const videoModelSupportsEndImage = useMemo(() => {
    if (menuState.mode !== "video" || !menuState.videoModelId) return false;
    // We'll check this by looking at the video models API data cached in VideoModeParams
    // For now, import getVideoModel directly
    const model = getVideoModel(menuState.videoModelId);
    return !!model?.imageParams.endImage;
  }, [menuState.mode, menuState.videoModelId]);

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
            isGeneratedImagePart(part) &&
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
  const lastPendingImagesRef = useRef<PendingImage[]>([]);
  const lastEditorContentRef = useRef<JSONContent | null>(null);
  // One-shot restore params used to prevent VideoModeParams init from
  // overwriting "put back" values with defaults/localStorage.
  const pendingVideoRestoreRef = useRef<{
    modelId: string;
    videoParams: Record<string, any>;
  } | null>(null);

  // Research telemetry: session tracking
  const sessionStartRef = useRef<number>(Date.now());
  const sessionTurnCountRef = useRef<number>(0);
  const sessionEndSentRef = useRef<boolean>(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

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

  // Upload files using presigned URL (bypasses Vercel's 4.5MB limit)
  // Accepts one or more files. Fails the entire batch if adding them would exceed the limit.
  const uploadAndAddImages = useCallback(
    async (files: File[]) => {
      // Validate every file first before starting any uploads
      for (const file of files) {
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
      }

      // Check if adding ALL files would exceed the limit — reject the whole batch if so
      const remaining = MAX_PENDING_IMAGES - pendingImages.length;
      if (files.length > remaining) {
        addToast({
          title: t("chat.tooManyImages", {
            count: files.length,
            max: MAX_PENDING_IMAGES,
            current: pendingImages.length,
          }),
          color: "warning",
        });
        return;
      }

      // All checks passed — create placeholders and start uploads in parallel
      const entries = files.map((file) => {
        const tempId = `uploading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const localPreviewUrl = URL.createObjectURL(file);
        const placeholder: PendingImage = {
          imageId: tempId,
          url: localPreviewUrl,
          source: "upload",
          title: file.name,
          isUploading: true,
          localPreviewUrl,
        };
        return { file, tempId, localPreviewUrl, placeholder };
      });

      // Add all placeholders at once
      setPendingImages((prev) => [...prev, ...entries.map((e) => e.placeholder)]);

      // Show compression warning for any files that exceed the threshold
      const hasLargeFiles = files.some((f) => shouldCompressFile(f));
      if (hasLargeFiles) {
        addToast({
          title: t("chat.fileWillBeCompressed", { threshold: getCompressThresholdMB() }),
          color: "warning",
        });
      }

      // Upload all files in parallel
      await Promise.all(
        entries.map(async ({ file, tempId, localPreviewUrl }) => {
          const result = await uploadImage(file, {
            onPhaseChange: (phase) => {
              if (phase === "compressing") {
                setPendingImages((prev) =>
                  prev.map((img) =>
                    img.imageId === tempId
                      ? { ...img, isUploading: false, isCompressing: true }
                      : img
                  )
                );
              }
            },
          });

          if (result.success) {
            setPendingImages((prev) =>
              prev.map((img) =>
                img.imageId === tempId
                  ? {
                    ...img,
                    imageId: result.data.imageId,
                    url: result.data.imageUrl,
                    isUploading: false,
                    isCompressing: false,
                    localPreviewUrl: undefined,
                  }
                  : img
              )
            );
            URL.revokeObjectURL(localPreviewUrl);
          } else {
            console.error("Image upload failed:", result.error);
            setPendingImages((prev) =>
              prev.filter((img) => img.imageId !== tempId)
            );
            URL.revokeObjectURL(localPreviewUrl);

            addToast({
              title: t("chat.uploadFailed"),
              color: "danger",
            });
          }
        })
      );
    },
    [pendingImages, t]
  );

  // Convenience wrapper for single-file upload (used by asset picker modal)
  const uploadAndAddImage = useCallback(
    async (file: File) => uploadAndAddImages([file]),
    [uploadAndAddImages]
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
    }, tag: ReferenceImageTag = "none", source: "library" | "upload" | "ai_generated" = "library") => {
      if (!canAddReferenceImage(referenceImages)) {
        addToast({
          title: t("chat.maxImagesReached", { max: MAX_REFERENCE_IMAGES }),
          color: "warning",
        });
        return;
      }

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

      trackResearch({
        chatId,
        eventType: "reference_image_added",
        imageId: asset.imageId,
        metadata: { tag, source },
      });
    },
    [referenceImages, t, chatId, trackResearch]
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

      if (shouldCompressFile(file)) {
        addToast({
          title: t("chat.fileWillBeCompressed", { threshold: getCompressThresholdMB() }),
          color: "warning",
        });
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
    async (files: File[]) => {
      if (assetPickerMode === "reference") {
        for (const file of files) {
          await uploadAndAddReferenceImage(file);
        }
      } else {
        await uploadAndAddImages(files);
      }
    },
    [assetPickerMode, uploadAndAddImages, uploadAndAddReferenceImage]
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

      const result = await uploadImage(file, {
        skipCollection: true,
        onPhaseChange: (phase) => {
          if (phase === "compressing") {
            setPendingImages((prev) =>
              prev.map((img) =>
                img.imageId === tempId
                  ? { ...img, isUploading: false, isCompressing: true }
                  : img
              )
            );
          }
        },
      });

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
                isCompressing: false,
                localPreviewUrl: undefined,
              }
              : img
          )
        );
        URL.revokeObjectURL(localPreviewUrl);

        // Auto-enable precision editing when user creates a marked image
        setPrecisionEditing(true);
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

    // Video mode requires a source image
    if (menuState.mode === "video" && pendingImages.length === 0) {
      addToast({
        title: t("chat.videoRequiresImage"),
        color: "warning",
      });
      return;
    }

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
    lastPendingImagesRef.current = [...pendingImages];
    lastEditorContentRef.current = chatInputRef.current?.getEditorJSON() || null;

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
                  isGeneratedImagePart(p) && p.imageId === selection.imageId
              );
              if (
                imgIndex !== -1 &&
                isGeneratedImagePart(newContent[imgIndex])
              ) {
                const agentImagePart = newContent[imgIndex] as Extract<
                  MessageContentPart,
                  { type: "agent_image" } | { type: "direct_image" }
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
    setPendingImages([]);
    setPrecisionEditing(false);
    
    // Clear the draft since we're sending the message
    clearChatDraft(chatId);
    // Reset draftHadImages so pre-select can work after AI response
    setDraftHadImages(false);

    setIsSending(true);
    sessionTurnCountRef.current += 1;

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
        window.dispatchEvent(new Event("refresh-chats"));
        if (!disableActiveChatPersistence) {
          window.history.replaceState(null, "", `/chat/${currentChatId}`);
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

      if (menuState.mode === "agent" || menuState.mode === "image") {
        payload.imageModelId = menuState.model;
        if (menuState.imageSize) {
          payload.imageSize = menuState.imageSize;
        }
      }

      // Pass video-specific params
      if (menuState.mode === "video") {
        payload.videoModelId = menuState.videoModelId;
        payload.videoParams = menuState.videoParams;
      }

      // Pass the mode so the backend knows whether to use agent or direct generation
      payload.mode = menuState.mode;

      // Add precision editing flag if enabled
      if (precisionEditing) {
        payload.precisionEditing = true;
      }

      // Pass aspect ratio if not "smart" (let agent decide)
      if (menuState.aspectRatio && menuState.aspectRatio !== "smart") {
        payload.aspectRatio = menuState.aspectRatio;
      }

      // Pass image quantity if not "smart" (let agent decide)
      if (menuState.imageQuantity && menuState.imageQuantity !== "smart") {
        payload.imageQuantity = parseInt(menuState.imageQuantity, 10);
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

              // Clear this variant's content (may have partial data from the last attempt)
              variantContents[variantId] = [];

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

                // Restore the user's original input and pending images
                setInput(lastUserInputRef.current);
                setPendingImages(lastPendingImagesRef.current);
                if (lastEditorContentRef.current && chatInputRef.current) {
                  chatInputRef.current.setEditorContent(lastEditorContentRef.current);
                }

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
            } else if (event.type === "tool_call") {
              // Tool call status updates — find existing or push new
              const existingIdx = currentContent.findIndex(
                (p) => p.type === "tool_call" && (p as any).tool === event.tool
              );
              if (existingIdx !== -1) {
                currentContent[existingIdx] = {
                  type: "tool_call",
                  tool: event.tool,
                  status: event.status,
                };
              } else {
                currentContent.push({
                  type: "tool_call",
                  tool: event.tool,
                  status: event.status,
                });
              }
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
              // If this is a completed shot list, replace the streaming placeholder
              if (event.part.type === "agent_shot_list" && event.part.status === "complete") {
                const placeholderIdx = currentContent.findIndex(
                  (p) => p.type === "agent_shot_list" && (p as any).status === "streaming"
                );
                if (placeholderIdx !== -1) {
                  currentContent[placeholderIdx] = event.part;
                } else {
                  currentContent.push(event.part);
                }
              } else {
                currentContent.push(event.part);
              }

              // Auto-create desktop asset for shot lists
              if (event.part.type === "agent_shot_list" && desktopId) {
                (async () => {
                  try {
                    const { getViewportCenterPosition } = await import("@/lib/desktop/types");
                    const pos = getViewportCenterPosition();
                    const assetRes = await fetch(`/api/desktop/${desktopId}/assets`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        assets: [{
                          assetType: "table",
                          metadata: {
                            title: event.part.title,
                            columns: event.part.columns,
                            rows: event.part.rows,
                            chatId: chatId,
                            status: "complete",
                          },
                          posX: pos.x,
                          posY: pos.y,
                          width: 700,
                          height: 40 + event.part.rows.length * 36 + 40,
                        }],
                      }),
                    });
                    if (assetRes.ok) {
                      const assetData = await assetRes.json();
                      window.dispatchEvent(
                        new CustomEvent("desktop-asset-added", {
                          detail: { assets: assetData.assets, desktopId },
                        })
                      );
                    }
                  } catch (e) {
                    console.error("Failed to add shot list asset to desktop:", e);
                  }
                })();
              }
            } else if (event.type === "shot_list_start") {
              // Show loading placeholder in chat
              currentContent.push({
                type: "agent_shot_list",
                title: "",
                columns: [],
                rows: [],
                status: "streaming",
              } as any);

              // Broadcast generating event to the room
              if (desktopId) {
                (async () => {
                  try {
                    const { getViewportCenterPosition } = await import("@/lib/desktop/types");
                    const pos = getViewportCenterPosition();
                    window.dispatchEvent(
                      new CustomEvent("desktop-table-generating", {
                        detail: { desktopId, posX: pos.x, posY: pos.y },
                      })
                    );
                  } catch {
                    window.dispatchEvent(
                      new CustomEvent("desktop-table-generating", {
                        detail: { desktopId, posX: 0, posY: 0 },
                      })
                    );
                  }
                })();
              }
            } else if (event.type === "part_update") {
              // Update existing part by imageId (for parallel support)
              if (event.imageId) {
                // Find the part with matching imageId
                const partIdx = currentContent.findIndex(
                  (p) => isGeneratedImagePart(p) && p.imageId === event.imageId
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

      // Check if any images had insufficient credits and show toast
      const allVariantContents = Object.values(variantContents);
      let hasInsufficientCredits = false;
      let hasAnyImages = false;
      for (const content of allVariantContents) {
        for (const part of content) {
          if (isGeneratedImagePart(part)) {
            hasAnyImages = true;
            if (part.status === "error" && part.reason === "INSUFFICIENT_CREDITS") {
              hasInsufficientCredits = true;
            }
          }
        }
      }
      if (hasInsufficientCredits) {
        addToast({
          title: t("credits.insufficientCredits"),
          color: "danger",
        });
      }
      if (hasAnyImages) {
        refreshBalance();
      }

      if (messages.length <= 1) {
        setTimeout(() => {
          window.dispatchEvent(new Event("refresh-chats"));
        }, 3000);
      }

      // Send succeeded — clean up saved refs and local preview URLs
      lastPendingImagesRef.current.forEach((img) => {
        if (img.localPreviewUrl) URL.revokeObjectURL(img.localPreviewUrl);
      });
      lastPendingImagesRef.current = [];
      lastUserInputRef.current = "";
      lastEditorContentRef.current = null;
    } catch (error) {
      console.error("Error sending message", error);
      setInput(lastUserInputRef.current);
      setPendingImages(lastPendingImagesRef.current);
      if (lastEditorContentRef.current && chatInputRef.current) {
        chatInputRef.current.setEditorContent(lastEditorContentRef.current);
      }
      setMessages((prev) =>
        prev.filter((msg) => !(msg.role === "user" && msg === userMessage))
      );
    } finally {
      setIsSending(false);
    }
  };

  // Handle precision editing toggle
  const handlePrecisionEditingChange = useCallback(
    (value: boolean) => {
      setPrecisionEditing(value);
    },
    []
  );

  // Handle menu state change
  const handleMenuStateChange = useCallback(
    (newState: MenuState) => {
      setMenuState(() => {
        const pendingRestore = pendingVideoRestoreRef.current;
        if (
          pendingRestore &&
          newState.mode === "video" &&
          newState.videoModelId === pendingRestore.modelId
        ) {
          pendingVideoRestoreRef.current = null;
          return {
            ...newState,
            videoParams: pendingRestore.videoParams,
          };
        }
        return newState;
      });
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
      addAgentImage({
        imageId: part.imageId,
        url,
        title: part.title,
        messageIndex,
        partIndex,
        variantId,
      });

      // Find the user's message that preceded this assistant response
      let userMessage: string | undefined;
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (messages[i]?.role === "user") {
          const content = messages[i].content;
          userMessage = typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content.filter((p) => p.type === "text").map((p) => (p as any).text).join(" ")
              : undefined;
          break;
        }
      }

      trackResearch({
        chatId,
        eventType: "image_selected",
        turnIndex: messageIndex,
        imageId: part.imageId,
        imagePosition: partIndex,
        variantId,
        metadata: {
          prompt: part.prompt,
          aspectRatio: part.aspectRatio,
          userMessage,
        },
      });
    }
  };

  // Handle sending a video generation request from an agent video card
  const handleSendVideoFromAgent = useCallback(
    async (config: {
      modelId: string;
      modelName: string;
      prompt: string;
      sourceImageId: string;
      sourceImageUrl?: string;
      params: Record<string, any>;
    }) => {
      if (isSending) return;

      // Build a user message with the source image and prompt text
      const parts: MessageContentPart[] = [];
      if (config.prompt) {
        parts.push({ type: "text", text: config.prompt });
      }
      parts.push({
        type: "image",
        imageId: config.sourceImageId,
        imageUrl: config.sourceImageUrl,
        source: "ai_generated" as const,
      });

      const userMessage: Message = {
        role: "user",
        content: parts,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsSending(true);

      try {
        let currentChatId = chatId;

        if (!currentChatId) {
          const createRes = await fetch("/api/chat", { method: "POST" });
          if (!createRes.ok) throw new Error("Failed to create chat");
          const createData = await createRes.json();
          currentChatId = createData.chat.id as string;
          setChatId(currentChatId);
          window.dispatchEvent(new Event("refresh-chats"));
          if (!disableActiveChatPersistence) {
            window.history.replaceState(null, "", `/chat/${currentChatId}`);
            localStorage.setItem(siteConfig.activeChatId, currentChatId);
          }
          onChatCreated?.(currentChatId);
        }

        const payload = {
          content: config.prompt,
          mode: "video",
          videoModelId: config.modelId,
          videoParams: config.params,
          imageIds: [config.sourceImageId],
          imageSources: [
            {
              imageId: config.sourceImageId,
              source: "ai_generated",
            },
          ],
          referenceImages: [],
        };

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
        let hasInitialized = false;
        const variantContents: MessageContentPart[] = [];
        let variantTimestamp: number | null = null;
        let responseVariantId = "";

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

              if (event.type === "message_timestamp") {
                variantTimestamp = event.timestamp;
                continue;
              }

              responseVariantId = event.variantId || "default";

              if (!hasInitialized) {
                const timestamp = variantTimestamp || Date.now();
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: [],
                    createdAt: timestamp,
                    variantId: responseVariantId,
                  },
                ]);
                hasInitialized = true;
              }

              if (event.type === "part") {
                variantContents.push(event.part);
              }

              setMessages((prev) => {
                const newMessages = [...prev];
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  if (
                    newMessages[i].role === "assistant" &&
                    newMessages[i].variantId === responseVariantId
                  ) {
                    newMessages[i] = {
                      ...newMessages[i],
                      content: [...variantContents],
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
      } catch (e: any) {
        console.error("Failed to send video from agent:", e);
        addToast({
          title: t("chat.sendFailed"),
          color: "danger",
        });
      } finally {
        setIsSending(false);
      }
    },
    [chatId, isSending, disableActiveChatPersistence, onChatCreated, t]
  );

  // Handle direct video status updates from DirectVideoCard
  const handleDirectVideoStatusUpdate = useCallback(
    (messageIndex: number, partIndex: number, updates: any) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        const msg = newMessages[messageIndex];
        if (msg && Array.isArray(msg.content)) {
          const newContent = [...msg.content];
          if (newContent[partIndex]?.type === "direct_video") {
            newContent[partIndex] = { ...newContent[partIndex], ...updates };
            newMessages[messageIndex] = { ...msg, content: newContent };
          }
        }
        return newMessages;
      });
    },
    []
  );

  // Handle direct video "put back" — restore generation params into the input
  const handleDirectVideoRestore = useCallback(
    (data: VideoRestoreData) => {
      const { prompt, image_url, end_image_url, ...restoredVideoParams } =
        data.params || {};
      const isSameModel = data.modelId === menuState.videoModelId;

      // Keep restored params in a one-shot ref so VideoModeParams model-init
      // can't overwrite them with defaults/localStorage.
      pendingVideoRestoreRef.current = isSameModel
        ? null
        : {
            modelId: data.modelId,
            videoParams: restoredVideoParams,
          };

      // Switch to video mode and set model + params
      setMenuState((prev) => ({
        ...resolveMenuState(
          {
            ...prev,
            mode: "video",
            videoModelId: data.modelId,
            videoParams: restoredVideoParams,
          },
          "video"
        ),
        // Explicitly preserve restored video fields
        videoModelId: data.modelId,
        videoParams: restoredVideoParams,
      }));

      // Force-apply restored params on the next microtask/frame to avoid
      // any late onParamsChange overwrite when already on the same model.
      queueMicrotask(() => {
        setMenuState((prev) => {
          if (prev.mode !== "video" || prev.videoModelId !== data.modelId) {
            return prev;
          }
          return {
            ...prev,
            videoParams: restoredVideoParams,
          };
        });
      });

      // Set the prompt text
      const restoredPrompt = typeof prompt === "string" ? prompt : "";
      setInput(restoredPrompt);
      // MentionTextbox is TipTap-based; update editor document explicitly.
      if (chatInputRef.current) {
        const content: JSONContent = restoredPrompt
          ? {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: restoredPrompt }],
                },
              ],
            }
          : {
              type: "doc",
              content: [{ type: "paragraph" }],
            };
        chatInputRef.current.setEditorContent(content);
      }

      // Set source image (and optionally end image)
      const images: PendingImage[] = [];
      if (data.sourceImageId) {
        images.push({
          imageId: data.sourceImageId,
          url: data.sourceImageUrl,
          source: "ai_generated",
        });
      }
      if (data.endImageId && data.endImageUrl) {
        images.push({
          imageId: data.endImageId,
          url: data.endImageUrl,
          source: "ai_generated",
        });
      }
      setPendingImages(images);
    },
    []
  );

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
              if (event.part.type === "agent_shot_list" && event.part.status === "complete") {
                const placeholderIdx = variantContent.findIndex(
                  (p) => p.type === "agent_shot_list" && (p as any).status === "streaming"
                );
                if (placeholderIdx !== -1) {
                  variantContent[placeholderIdx] = event.part;
                } else {
                  variantContent.push(event.part);
                }
              } else {
                variantContent.push(event.part);
              }
            } else if (event.type === "part_update") {
              // Update existing part by imageId
              if (event.imageId) {
                const partIdx = variantContent.findIndex(
                  (p) => isGeneratedImagePart(p) && p.imageId === event.imageId
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
                desktopId={desktopId}
                allMessages={messages}
                onSendAsVideoMessage={handleSendVideoFromAgent}
              />
            );
          } else {
            // Assistant message(s) - use ParallelMessage for variants
            const messageTimestamp = group.messages[0]?.createdAt;
            // Only show "New Idea" button on the last assistant message group
            // (not for direct image/video modes)
            const isLastAssistantGroup =
              groupIdx === groupedMessages.length - 1 ||
              (groupIdx === groupedMessages.length - 2 &&
                groupedMessages[groupedMessages.length - 1]?.type === "user");
            const isDirectGeneration = group.messages.some((m) => {
              if (m.agentId === "direct-image" || m.agentId === "direct-video") {
                return true;
              }
              if (!Array.isArray(m.content)) return false;
              return m.content.some(
                (part) =>
                  part.type === "direct_image" || part.type === "direct_video"
              );
            });
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
                  isLastAssistantGroup && !isDirectGeneration && messageTimestamp
                    ? () => handleGenerateVariant(messageTimestamp)
                    : undefined
                }
                isGeneratingVariant={
                  generatingVariantTimestamp === messageTimestamp
                }
                isSending={isSending}
                desktopId={desktopId}
                allMessages={messages}
                onDirectVideoStatusUpdate={handleDirectVideoStatusUpdate}
                onDirectVideoRestore={handleDirectVideoRestore}
                onSendAsVideoMessage={handleSendVideoFromAgent}
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
        {isSending &&
          groupedMessages.length > 0 &&
          groupedMessages[groupedMessages.length - 1]?.type !== "user" && (
            <div className="flex gap-3 max-w-3xl mx-auto justify-start items-center">
              {!hideAvatars && (
                <div className="hidden md:flex w-8 h-8 shrink-0" />
              )}
              <Spinner variant="dots" size="sm" className="ml-1" />
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
        onFilesUpload={uploadAndAddImages}
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
        videoCost={videoCost}
        videoCostLoading={videoCostLoading}
        videoModelSupportsEndImage={videoModelSupportsEndImage}
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
        desktopId={desktopId}
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
