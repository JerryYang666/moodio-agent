"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

interface SelectedAsset {
  assetId: string;
  url: string;
  title: string;
  imageId: string;
}

interface SelectedAgentPart {
  url: string;
  title: string;
  messageIndex: number;
  partIndex: number;
  imageId?: string;
  variantId?: string;
}

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [precisionEditing, setPrecisionEditing] = useState(false);
  const [menuState, setMenuState] = useState<MenuState>(INITIAL_MENU_STATE);

  // Listen for reset-chat event (triggered when clicking New Chat button while technically already on /chat)
  useEffect(() => {
    const handleReset = () => {
      setChatId(undefined);
      setMessages([]);
      setInput("");
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedAsset(null);
      setSelectedAgentPart(null);
      setPrecisionEditing(false);
      setIsSending(false);

      // Ensure we clean up any draft that might be lingering
      localStorage.removeItem(`${siteConfig.chatInputPrefix}new-chat`);
    };

    window.addEventListener("reset-chat", handleReset);
    return () => window.removeEventListener("reset-chat", handleReset);
  }, [previewUrl]);

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

  // State for selected agent image (for sending in next message)
  const [selectedAgentPart, setSelectedAgentPart] =
    useState<SelectedAgentPart | null>(null);

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

  const applySelectedFile = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert("File size too large. Max 5MB.");
      return;
    }
    // Local upload and asset selection are mutually exclusive
    setSelectedAsset(null);
    setSelectedFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);

    // If in "edit" mode and no other images remain, switch to "create" mode
    if (menuState.mode === "edit" && !selectedAgentPart) {
      const newState = resolveMenuState(menuState, "create");
      setMenuState(newState);
    }
  }, [previewUrl, menuState, selectedAgentPart]);

  const clearSelectedAsset = useCallback(() => {
    setSelectedAsset(null);
    // If in "edit" mode and no other images remain, switch to "create" mode
    if (menuState.mode === "edit" && !previewUrl) {
      const newState = resolveMenuState(menuState, "create");
      setMenuState(newState);
    }
  }, [menuState, previewUrl]);

  const applySelectedAsset = useCallback(
    (payload: SelectedAsset) => {
      if (messages.length > 0) {
        addToast({
          title: "You can only attach an existing asset in the first message.",
          color: "warning",
        });
        return;
      }
      // Asset selection and local upload are mutually exclusive
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedAsset(payload);
    },
    [previewUrl, messages.length]
  );

  // Listen for asset selection events from the hover sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      const d = ce.detail as any;
      if (!d?.assetId || !d?.url || !d?.imageId) return;
      applySelectedAsset({
        assetId: d.assetId,
        url: d.url,
        title: d.title || "Selected asset",
        imageId: d.imageId,
      });
    };
    window.addEventListener("moodio-asset-selected", handler as any);
    return () => window.removeEventListener("moodio-asset-selected", handler as any);
  }, [applySelectedAsset]);

  const handleAssetDrop = useCallback(
    async (payload: any) => {
      if (payload?.assetId && payload?.url && payload?.imageId) {
        applySelectedAsset({
          assetId: payload.assetId,
          url: payload.url,
          title: payload.title || "Selected asset",
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
          applySelectedAsset({
            assetId: a.id,
            url: a.imageUrl,
            title: a.generationDetails?.title || "Selected asset",
            imageId: a.imageId,
          });
        } catch (e) {
          console.error("Failed to load dropped asset", e);
        }
      }
    },
    [applySelectedAsset]
  );

  const handleAssetPicked = useCallback(
    (asset: AssetSummary) => {
      applySelectedAsset({
        assetId: asset.id,
        url: asset.imageUrl,
        title: asset.generationDetails?.title || "Selected asset",
        imageId: asset.imageId,
      });
    },
    [applySelectedAsset]
  );

  const handleSend = async () => {
    if (
      (!input.trim() && !selectedFile && !selectedAgentPart && !selectedAsset) ||
      isSending ||
      isRecording ||
      isTranscribing
    )
      return;

    let currentInput = input;
    if (selectedAgentPart) {
      const prefix = `I select ${selectedAgentPart.title}`;
      currentInput = currentInput ? `${prefix}\n\n${currentInput}` : prefix;
    }

    // Save the original input for potential retry exhausted scenario
    lastUserInputRef.current = input;

    const currentFile = selectedFile;
    const currentPreviewUrl = previewUrl;
    const currentAsset = selectedAsset;

    // Optimistic message with current timestamp
    const optimisticContent: Message["content"] =
      (currentFile && currentPreviewUrl) || currentAsset
        ? (() => {
            const parts: MessageContentPart[] = [];
            if (currentInput) {
              parts.push({ type: "text", text: currentInput });
            }
            const imageUrl = currentAsset ? currentAsset.url : currentPreviewUrl!;
            parts.push({ type: "image_url", image_url: { url: imageUrl } });
            return parts;
          })()
        : currentInput;

    const userMessage: Message = {
      role: "user",
      content: optimisticContent,
      createdAt: Date.now(),
    };

    // Optimistically update previous message if selection exists
    if (selectedAgentPart) {
      setMessages((prev) => {
        const newMessages = [...prev];
        
        // Find the correct message - use variantId if available, otherwise fall back to messageIndex
        let msgIndex = selectedAgentPart.messageIndex;
        if (selectedAgentPart.variantId) {
          const variantIndex = newMessages.findIndex(
            (m) => m.variantId === selectedAgentPart.variantId
          );
          if (variantIndex !== -1) {
            msgIndex = variantIndex;
          }
        }
        
        if (newMessages[msgIndex]) {
          const msg = newMessages[msgIndex];
          if (Array.isArray(msg.content)) {
            const newContent = [...msg.content];
            // Find the part by imageId for reliability
            let partIndex = selectedAgentPart.partIndex;
            if (selectedAgentPart.imageId) {
              const imgIndex = newContent.findIndex(
                (p) => p.type === "agent_image" && p.imageId === selectedAgentPart.imageId
              );
              if (imgIndex !== -1) {
                partIndex = imgIndex;
              }
            }
            if (
              newContent[partIndex] &&
              newContent[partIndex].type === "agent_image"
            ) {
              const agentImagePart = newContent[partIndex] as Extract<MessageContentPart, { type: "agent_image" }>;
              newContent[partIndex] = {
                ...agentImagePart,
                isSelected: true,
              };
              newMessages[msgIndex] = { ...msg, content: newContent };
            }
          }
        }
        return [...newMessages, userMessage];
      });
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }

    setInput("");
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedAsset(null);
    setSelectedAgentPart(null);
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

      let body;
      let headers: Record<string, string> = {};

      if (currentFile) {
        const formData = new FormData();
        formData.append("message", currentInput);
        formData.append("file", currentFile);
        if (selectedAgentPart) {
          formData.append(
            "selection",
            JSON.stringify({
              messageIndex: selectedAgentPart.messageIndex,
              partIndex: selectedAgentPart.partIndex,
              imageId: selectedAgentPart.imageId,
              variantId: selectedAgentPart.variantId,
            })
          );
        }
        if (precisionEditing) {
          formData.append("precisionEditing", "true");
          if (selectedAgentPart?.imageId) {
            formData.append("precisionEditImageId", selectedAgentPart.imageId);
          }
        }
        // Pass aspect ratio if not "smart" (let agent decide)
        if (menuState.aspectRatio && menuState.aspectRatio !== "smart") {
          formData.append("aspectRatio", menuState.aspectRatio);
        }

        const overrideEnabled =
          localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY + "_enabled") ===
          "true";
        if (overrideEnabled) {
          const overridePrompt = localStorage.getItem(
            SYSTEM_PROMPT_STORAGE_KEY
          );
          if (overridePrompt) {
            formData.append("systemPromptOverride", overridePrompt);
          }
        }

        body = formData;
      } else {
        const payload: any = { content: currentInput };
        if (currentAsset) {
          payload.assetId = currentAsset.assetId;
        }
        if (selectedAgentPart) {
          payload.selection = {
            messageIndex: selectedAgentPart.messageIndex,
            partIndex: selectedAgentPart.partIndex,
            imageId: selectedAgentPart.imageId,
            variantId: selectedAgentPart.variantId,
          };
        }
        if (precisionEditing) {
          payload.precisionEditing = true;
          if (selectedAgentPart?.imageId) {
            payload.precisionEditImageId = selectedAgentPart.imageId;
          }
        }
        // Pass aspect ratio if not "smart" (let agent decide)
        if (menuState.aspectRatio && menuState.aspectRatio !== "smart") {
          payload.aspectRatio = menuState.aspectRatio;
        }

        const overrideEnabled =
          localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY + "_enabled") ===
          "true";
        if (overrideEnabled) {
          const overridePrompt = localStorage.getItem(
            SYSTEM_PROMPT_STORAGE_KEY
          );
          if (overridePrompt) {
            payload.systemPromptOverride = overridePrompt;
          }
        }

        body = JSON.stringify(payload);
        headers = { "Content-Type": "application/json" };
      }

      const res = await fetch(`/api/chat/${currentChatId}/message`, {
        method: "POST",
        headers,
        body,
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
                  "Oops! Let me think about that again... 🤔",
                  "Hmm, let me rephrase that better! 💭",
                  "One sec, organizing my thoughts... ✨",
                  "Wait, I can do better! 🎨",
                  "Let me try that again with more sparkle! ⭐",
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
                  "Oops! Our agent got a bit overwhelmed... 🥺 Mind trying again?",
                  "So sorry! Our agent is taking a coffee break ☕ Please try again!",
                  "Uh oh! Our agent tripped over their thoughts 🤭 Give it another go?",
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
        url, // Use signed CloudFront URL from API
        title: part.title,
        prompt: part.prompt,
        imageId: part.imageId,
        status: part.status,
      });
      onOpen();
    }
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
    if (part.status === "generated") {
      const url = part.imageUrl || ""; // Use signed CloudFront URL from API
      if (
        selectedAgentPart?.url === url &&
        selectedAgentPart?.messageIndex === messageIndex &&
        selectedAgentPart?.variantId === variantId
      ) {
        setSelectedAgentPart(null);
      } else {
        setSelectedAgentPart({
          url,
          title: part.title,
          messageIndex,
          partIndex,
          imageId: part.imageId,
          variantId,
        });
      }
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
        title: "Failed to fork chat",
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
            <p>Start a conversation with Moodio Agent</p>
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
                selectedAgentPart={selectedAgentPart}
                onAgentImageSelect={handleAgentImageSelect}
                onAgentTitleClick={handleAgentTitleClick}
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
                selectedAgentPart={selectedAgentPart}
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
        previewUrl={previewUrl}
        onClearFile={clearFile}
        selectedAgentPart={selectedAgentPart}
        onClearSelectedAgentPart={() => {
          setSelectedAgentPart(null);
          // If in "edit" mode and no other images remain, switch to "create" mode
          if (menuState.mode === "edit" && !previewUrl) {
            const newState = resolveMenuState(menuState, "create");
            setMenuState(newState);
          }
        }}
        selectedAsset={selectedAsset}
        onClearSelectedAsset={clearSelectedAsset}
        onOpenAssetPicker={() => setIsAssetPickerOpen(true)}
        onAssetDrop={handleAssetDrop}
        showFileUpload={messages.length === 0}
        precisionEditing={precisionEditing}
        onPrecisionEditingChange={handlePrecisionEditingChange}
        menuState={menuState}
        onMenuStateChange={setMenuState}
      />

      <AssetPickerModal
        isOpen={isAssetPickerOpen}
        onOpenChange={() => setIsAssetPickerOpen((v) => !v)}
        onSelect={handleAssetPicked}
        onUpload={applySelectedFile}
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
