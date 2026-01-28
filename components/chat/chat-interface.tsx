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
import {
  Message,
  MessageContentPart,
  PARALLEL_VARIANT_COUNT,
} from "@/lib/llm/types";
import ImageDetailModal, { ImageInfo } from "./image-detail-modal";
import ChatMessage from "./chat-message";
import ChatInput from "./chat-input";
import ParallelMessage from "./parallel-message";
import AssetPickerModal, { type AssetSummary } from "./asset-picker-modal";
import { siteConfig } from "@/config/site";
import { useVoiceRecorder } from "./use-voice-recorder";
import { SYSTEM_PROMPT_STORAGE_KEY } from "@/components/test-kit";
import {
  MenuState,
  INITIAL_MENU_STATE,
  resolveMenuState,
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

// Helper to group consecutive assistant messages with the same timestamp as variants
interface MessageGroup {
  type: "user" | "assistant";
  messages: Message[];
  originalIndex: number; // Index of the first message in this group
}

interface ChatInterfaceProps {
  chatId?: string;
  initialMessages?: Message[];
}

export default function ChatInterface({
  chatId: initialChatId,
  initialMessages = [],
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
  // Unified pending images array - replaces selectedFile, previewUrl, selectedAsset, selectedAgentPart
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [precisionEditing, setPrecisionEditing] = useState(false);
  const [menuState, setMenuState] = useState<MenuState>(INITIAL_MENU_STATE);

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

      // Ensure we clean up any draft that might be lingering
      localStorage.removeItem(`${siteConfig.chatInputPrefix}new-chat`);
    };

    window.addEventListener("reset-chat", handleReset);
    return () => window.removeEventListener("reset-chat", handleReset);
  }, [pendingImages]);

  // Draft saving logic
  const [prevChatId, setPrevChatId] = useState(chatId);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  if (chatId !== prevChatId) {
    setPrevChatId(chatId);
    setIsDraftLoaded(false);
  }

  useEffect(() => {
    const key = `${siteConfig.chatInputPrefix}${chatId || "new-chat"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      setInput(saved);
    } else {
      setInput("");
    }
    setIsDraftLoaded(true);
  }, [chatId]);

  useEffect(() => {
    if (isDraftLoaded) {
      const key = `${siteConfig.chatInputPrefix}${chatId || "new-chat"}`;
      if (input) {
        localStorage.setItem(key, input);
      } else {
        localStorage.removeItem(key);
      }
    }
  }, [input, chatId, isDraftLoaded]);

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
    setInput((prev) => (prev ? `${prev} ${text}` : text));
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
      addAssetImage({
        assetId: asset.id,
        url: asset.imageUrl,
        title: asset.generationDetails?.title || t("chat.selectedAsset"),
        imageId: asset.imageId,
      });
    },
    [addAssetImage, t]
  );

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

    // Build optimistic message content with image URLs for display
    const optimisticContent: Message["content"] =
      currentPendingImages.length > 0
        ? (() => {
            const parts: MessageContentPart[] = [];
            if (currentInput) {
              parts.push({ type: "text", text: currentInput });
            }
            // Add images to the optimistic content
            for (const img of currentPendingImages) {
              parts.push({ type: "image_url", image_url: { url: img.url } });
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

    setIsSending(true);

    try {
      // Check for notification permission when user sends a message
      notificationModalRef.current?.checkPermission();

      let currentChatId = chatId;

      if (!currentChatId) {
        const createRes = await fetch("/api/chat", { method: "POST" });
        if (!createRes.ok) throw new Error("Failed to create chat");
        const createData = await createRes.json();
        currentChatId = createData.chat.id;
        setChatId(currentChatId);
        window.history.replaceState(null, "", `/chat/${currentChatId}`);
        window.dispatchEvent(new Event("refresh-chats"));
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
      const variantTimestamp = Date.now();

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
                Object.keys(variantContents).length >= PARALLEL_VARIANT_COUNT
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
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: [],
                  createdAt: variantTimestamp,
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

      // Save draft for new chat
      const draftKey = `${siteConfig.chatInputPrefix}${newChatId}`;
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
      localStorage.setItem(draftKey, content);

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
              />
            );
          } else {
            // Assistant message(s) - use ParallelMessage for variants
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
              />
            );
          }
        })}

        {isSending &&
          groupedMessages.length > 0 &&
          groupedMessages[groupedMessages.length - 1]?.type === "user" && (
            <div className="flex gap-3 max-w-3xl mx-auto justify-start items-center">
              <div className="hidden md:flex w-8 h-8 rounded-full bg-primary/10 items-center justify-center shrink-0">
                <Bot size={16} className="text-primary" />
              </div>
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
        onOpenAssetPicker={() => setIsAssetPickerOpen(true)}
        onAssetDrop={handleAssetDrop}
        showFileUpload={true}
        precisionEditing={precisionEditing}
        onPrecisionEditingChange={handlePrecisionEditingChange}
        menuState={menuState}
        onMenuStateChange={setMenuState}
        hasUploadingImages={hasUploadingImages(pendingImages)}
      />

      <AssetPickerModal
        isOpen={isAssetPickerOpen}
        onOpenChange={() => setIsAssetPickerOpen((v) => !v)}
        onSelect={handleAssetPicked}
        onUpload={uploadAndAddImage}
      />

      <ImageDetailModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        selectedImage={selectedImage}
        allImages={allImages}
        currentIndex={currentImageIndex}
        onNavigate={handleImageNavigate}
        onClose={onClose}
      />
      <NotificationPermissionModal ref={notificationModalRef} />
    </div>
  );
}
