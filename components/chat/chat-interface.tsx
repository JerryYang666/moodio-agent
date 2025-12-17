"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import ChatMessage from "./chat-message";
import ChatInput from "./chat-input";
import { siteConfig } from "@/config/site";
import { useVoiceRecorder } from "./use-voice-recorder";
import { SYSTEM_PROMPT_STORAGE_KEY } from "@/components/test-kit";
import { MenuState, INITIAL_MENU_STATE } from "./menu-configuration";

interface SelectedAgentPart {
  url: string;
  title: string;
  messageIndex: number;
  partIndex: number;
  imageId?: string;
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
      setSelectedAgentPart(null);
      setPrecisionEditing(false);
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";

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

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("File size too large. Max 5MB.");
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (
      (!input.trim() && !selectedFile && !selectedAgentPart) ||
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

    // Optimistic message with current timestamp
    const userMessage: Message = {
      role: "user",
      content:
        currentFile && currentPreviewUrl
          ? [
              { type: "text", text: currentInput },
              { type: "image_url", image_url: { url: currentPreviewUrl } },
            ]
          : currentInput,
      createdAt: Date.now(),
    };

    // Optimistically update previous message if selection exists
    if (selectedAgentPart) {
      setMessages((prev) => {
        const newMessages = [...prev];
        const msgIndex = selectedAgentPart.messageIndex;
        if (newMessages[msgIndex]) {
          const msg = newMessages[msgIndex];
          if (Array.isArray(msg.content)) {
            const newContent = [...msg.content];
            const partIndex = selectedAgentPart.partIndex;
            if (
              newContent[partIndex] &&
              newContent[partIndex].type === "agent_image"
            ) {
              newContent[partIndex] = {
                ...newContent[partIndex],
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
    setPreviewUrl(null);
    setSelectedAgentPart(null);
    setPrecisionEditing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

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
            })
          );
        }
        if (precisionEditing) {
          formData.append("precisionEditing", "true");
          if (selectedAgentPart?.imageId) {
            formData.append("precisionEditImageId", selectedAgentPart.imageId);
          }
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
        if (selectedAgentPart) {
          payload.selection = {
            messageIndex: selectedAgentPart.messageIndex,
            partIndex: selectedAgentPart.partIndex,
            imageId: selectedAgentPart.imageId,
          };
        }
        if (precisionEditing) {
          payload.precisionEditing = true;
          if (selectedAgentPart?.imageId) {
            payload.precisionEditImageId = selectedAgentPart.imageId;
          }
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
      let isFirstChunk = true;

      // Temporary storage for the message content parts
      let currentContent: MessageContentPart[] = [];

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

            if (event.type === "invalidate") {
              // LLM is being retried - clear current content and reset state
              console.log(
                "[Chat] Received invalidate signal - clearing assistant message for retry"
              );

              // Show a cute toast notification
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

              currentContent = [];
              isFirstChunk = true;

              // Remove the assistant message from UI
              setMessages((prev) => {
                const newMessages = [...prev];
                if (
                  newMessages.length > 0 &&
                  newMessages[newMessages.length - 1].role === "assistant"
                ) {
                  return newMessages.slice(0, -1);
                }
                return newMessages;
              });
              continue;
            }

            if (event.type === "retry_exhausted") {
              // All retries failed - restore user input and remove messages
              console.log(
                "[Chat] Received retry_exhausted signal - restoring user input"
              );

              // Cancel chat monitoring since the request failed
              if (currentChatId) {
                cancelMonitorChat(currentChatId);
              }

              // Show a cute error toast
              const cuteErrorMessages = [
                "Oops! Our agent got a bit overwhelmed... 🥺 Mind trying again?",
                "So sorry! Our agent is taking a coffee break ☕ Please try again!",
                "Uh oh! Our agent tripped over their thoughts 🤭 Give it another go?",
                "Our agent's having a moment... 😅 Could you try once more?",
                "Whoopsie! The agent's brain did a somersault 🤸 Try again?",
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

              // Remove both the assistant message (if present) and the user message
              setMessages((prev) => {
                const newMessages = [...prev];
                // Remove assistant message if present
                if (
                  newMessages.length > 0 &&
                  newMessages[newMessages.length - 1].role === "assistant"
                ) {
                  newMessages.pop();
                }
                // Remove user message
                if (
                  newMessages.length > 0 &&
                  newMessages[newMessages.length - 1].role === "user"
                ) {
                  newMessages.pop();
                }
                return newMessages;
              });

              // Break out of the read loop since we're done
              break;
            }

            if (isFirstChunk) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: [],
                  createdAt: Date.now(),
                },
              ]);
              isFirstChunk = false;
            }

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
                currentContent = [
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
              // Update existing part
              // For admins (internal_think present), use offset +2; for others, use +1
              const hasThink = currentContent.some(
                (p) => p.type === "internal_think"
              );
              const offset = hasThink ? 2 : 1;
              if (currentContent[event.index + offset]) {
                currentContent[event.index + offset] = event.part;
              }
            }

            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg && lastMsg.role === "assistant") {
                lastMsg.content = [...currentContent];
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
    partIndex: number
  ) => {
    if (part.status === "generated") {
      const url = part.imageUrl || ""; // Use signed CloudFront URL from API
      if (
        selectedAgentPart?.url === url &&
        selectedAgentPart?.messageIndex === messageIndex
      ) {
        setSelectedAgentPart(null);
      } else {
        setSelectedAgentPart({
          url,
          title: part.title,
          messageIndex,
          partIndex,
          imageId: part.imageId,
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

        {messages.map((msg, idx) => (
          <ChatMessage
            key={idx}
            message={msg}
            messageIndex={idx}
            chatId={chatId}
            user={user}
            selectedAgentPart={selectedAgentPart}
            onAgentImageSelect={handleAgentImageSelect}
            onAgentTitleClick={handleAgentTitleClick}
            onForkChat={handleForkChat}
          />
        ))}

        {isSending && messages[messages.length - 1]?.role === "user" && (
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
        onFileSelect={handleFileSelect}
        onClearFile={clearFile}
        selectedAgentPart={selectedAgentPart}
        onClearSelectedAgentPart={() => setSelectedAgentPart(null)}
        showFileUpload={messages.length === 0}
        precisionEditing={precisionEditing}
        onPrecisionEditingChange={setPrecisionEditing}
        menuState={menuState}
        onMenuStateChange={setMenuState}
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
