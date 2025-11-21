"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { useDisclosure } from "@heroui/modal";
import { Avatar } from "@heroui/avatar";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { siteConfig } from "@/config/site";
import {
  Send,
  Bot,
  User as UserIcon,
  X,
  ImagePlus,
  Mic,
  Square,
} from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import { useRouter } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import { NotificationPermissionModal, NotificationPermissionModalRef } from "@/components/notification-permission-modal";
import { Message, MessageContentPart } from "@/lib/llm/types";
import ImageDetailModal from "./image-detail-modal";
import ImageWithMenu from "@/components/collection/image-with-menu";

const AWS_S3_PUBLIC_URL = process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL || "";

// Helper to get image URL
const getImageUrl = (imageId: string) => {
  return `${AWS_S3_PUBLIC_URL}/${imageId}`;
};

// Helper to detect supported audio MIME type for MediaRecorder (iOS Safari compatibility)
const getSupportedMimeType = (): string | null => {
  // Check if MediaRecorder is available
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  const types = [
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mpeg",
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log(`Using audio format: ${type}`);
      return type;
    }
  }
  
  console.warn("No supported audio format found");
  return null;
};

// Helper to get file extension from MIME type
const getFileExtension = (mimeType: string): string => {
  const mimeToExtension: Record<string, string> = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/ogg;codecs=opus": "ogg",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mp4;codecs=mp4a.40.2": "mp4",
    "audio/mpeg": "mp3",
  };

  return mimeToExtension[mimeType] || "webm";
};

interface ChatInterfaceProps {
  chatId?: string;
  initialMessages?: Message[];
}

export default function ChatInterface({
  chatId: initialChatId,
  initialMessages = [],
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const { monitorChat } = useChat();
  const router = useRouter();
  const [chatId, setChatId] = useState<string | undefined>(initialChatId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(
    !!initialChatId && initialMessages.length === 0
  );
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Modal state for agent images
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    title: string;
    prompt: string;
    status?: "loading" | "generated" | "error";
  } | null>(null);
  
  // State for selected agent image (for sending in next message)
  const [selectedAgentPart, setSelectedAgentPart] = useState<{
    url: string;
    title: string;
    messageIndex: number;
    partIndex: number;
  } | null>(null);

  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const notificationModalRef = useRef<NotificationPermissionModalRef>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Check for max recording duration
  useEffect(() => {
    if (isRecording && recordingTime >= siteConfig.audioRecording.maxDuration) {
      stopRecording();
    }
  }, [recordingTime, isRecording]);

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

  const startRecording = async () => {
    try {
      // Check if MediaRecorder is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Audio recording is not supported on this browser. Please use HTTPS or a supported browser.");
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        alert("MediaRecorder is not supported on this browser.");
        return;
      }

      // Detect supported MIME type for iOS Safari compatibility
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        alert("Audio recording format is not supported on this device. Please try a different browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType,
        });
        await handleTranscription(audioBlob, mimeType);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      if (error instanceof Error) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          alert("Microphone permission denied. Please allow microphone access in your browser settings.");
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          alert("No microphone found. Please connect a microphone and try again.");
        } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
          alert("Microphone is already in use by another application.");
        } else {
          alert(`Unable to access microphone: ${error.message}`);
        }
      } else {
        alert("Unable to access microphone. Please check permissions and try again.");
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTime(0);
    }
  };

  const handleTranscription = async (audioBlob: Blob, mimeType: string) => {
    setIsTranscribing(true);
    try {
      // Determine file extension based on MIME type
      const extension = getFileExtension(mimeType);
      const file = new File([audioBlob], `recording.${extension}`, {
        type: mimeType,
      });

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Transcription failed");
      }

      const data = await res.json();
      if (data.text) {
        setInput((prev) => (prev ? `${prev} ${data.text}` : data.text));
      }
    } catch (error) {
      console.error("Transcription error:", error);
      alert("Failed to transcribe audio.");
    } finally {
      setIsTranscribing(false);
    }
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
            if (newContent[partIndex] && newContent[partIndex].type === "agent_image") {
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
      // messages.length is current count. We added optimistic user message (+1).
      // We expect assistant message (+1). So threshold is current + 1.
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
          formData.append("selection", JSON.stringify({
            messageIndex: selectedAgentPart.messageIndex,
            partIndex: selectedAgentPart.partIndex
          }));
        }
        body = formData;
      } else {
        const payload: any = { content: currentInput };
        if (selectedAgentPart) {
          payload.selection = {
            messageIndex: selectedAgentPart.messageIndex,
            partIndex: selectedAgentPart.partIndex
          };
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

            if (event.type === "text") {
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
              if (currentContent[event.index + 1]) {
                currentContent[event.index + 1] = event.part;
              }
            }

            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg.role === "assistant") {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAgentTitleClick = (part: any) => {
    if (part.status === "generated" || part.status === "error") {
      setSelectedImage({
        url: part.imageUrl || (part.imageId ? getImageUrl(part.imageId) : ""),
        title: part.title,
        prompt: part.prompt,
        status: part.status,
      });
      onOpen();
    }
  };

  const handleAgentImageSelect = (
    part: any,
    messageIndex: number,
    partIndex: number
  ) => {
    if (part.status === "generated") {
      const url = part.imageUrl || getImageUrl(part.imageId);
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
        });
      }
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const renderContent = (content: string | MessageContentPart[], messageIndex?: number) => {
    if (typeof content === "string") {
      return <ReactMarkdown>{content}</ReactMarkdown>;
    }

    // Group agent images to render them in a grid
    const textParts = content.filter((p) => p.type === "text");
    const imageParts = content.filter(
      (p) => p.type === "image" || p.type === "image_url"
    );
    const agentParts = content.filter((p) => p.type === "agent_image");

    return (
      <div className="space-y-4">
        {textParts.map((part: any, i) => (
          <ReactMarkdown key={`text-${i}`}>{part.text}</ReactMarkdown>
        ))}

        {imageParts.length > 0 && (
          <div className="space-y-2">
            {imageParts.map((part: any, i) => (
              <img
                key={`img-${i}`}
                src={
                  part.type === "image"
                  ? getImageUrl(part.imageId)
                  : part.image_url.url
                }
                alt="User upload"
                className="max-w-full rounded-lg"
                style={{ maxHeight: "300px", objectFit: "contain" }}
              />
            ))}
          </div>
        )}

        {agentParts.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            {agentParts.map((part: any, i) => {
              const url =
                part.imageUrl ||
                (part.imageId ? getImageUrl(part.imageId) : "");
              const isSelected =
                (selectedAgentPart?.url === url &&
                  selectedAgentPart?.messageIndex === messageIndex) ||
                part.isSelected;

              const realPartIndex = (content as MessageContentPart[]).indexOf(
                part
              );

              return (
                <ImageWithMenu
                  key={`agent-${i}`}
                  imageId={part.imageId || ""}
                  imageUrl={url}
                  chatId={chatId}
                  generationDetails={{
                    title: part.title,
                    prompt: part.prompt,
                    status: part.status,
                  }}
                  onViewDetails={() => handleAgentTitleClick(part)}
                >
                  <Card
                    className={clsx(
                      "w-full",
                      isSelected && "border-4 border-primary"
                    )}
                  >
                    <CardBody
                      className="p-0 overflow-hidden relative aspect-square cursor-pointer group/image rounded-lg"
                      onClick={() =>
                        part.status === "generated" &&
                        messageIndex !== undefined &&
                        handleAgentImageSelect(
                          part,
                          messageIndex,
                          realPartIndex
                        )
                      }
                    >
                      {part.status === "loading" && (
                        <div className="w-full h-full flex items-center justify-center bg-default-100">
                          <Spinner />
                        </div>
                      )}
                      {part.status === "error" && (
                        <div className="w-full h-full flex items-center justify-center bg-danger-50 text-danger">
                          <X />
                        </div>
                      )}
                      {part.status === "generated" && (
                        <img
                          src={url}
                          alt={part.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {(part.status === "generated" || part.status === "error") && (
                        <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-black/60 text-black dark:text-white p-2 text-xs truncate opacity-0 group-hover/image:opacity-100 transition-opacity">
                          {part.title}
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </ImageWithMenu>
              );
            })}
          </div>
        )}
      </div>
    );
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
      <div className="flex-1 overflow-y-auto space-y-6 pb-4 pr-2 scrollbar-hide">
        {messages.length === 0 && (
          <div className="text-center text-default-500 mt-60">
            <Bot size={48} className="mx-auto mb-4 opacity-20" />
            <p>Start a conversation with Moodio Agent</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={idx}
              className={clsx(
                "flex gap-3 max-w-3xl mx-auto",
                isUser ? "justify-end" : "justify-start"
              )}
            >
              {!isUser && (
                <div className="hidden md:flex w-8 h-8 rounded-full bg-primary/10 items-center justify-center shrink-0 mt-1">
                  <Bot size={16} className="text-primary" />
                </div>
              )}

              <div
                className={clsx(
                  "flex flex-col gap-1",
                  isUser ? "max-w-[80%]" : "max-w-full md:max-w-[80%]"
                )}
              >
                <Card
                  className={clsx(
                    "shadow-none",
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-default-100 dark:bg-default-50/10"
                  )}
                >
                  <CardBody className="p-3 overflow-x-auto">
                    <div
                      className={clsx(
                        "prose dark:prose-invert prose-sm max-w-none",
                        isUser &&
                          "prose-headings:text-primary-foreground prose-p:text-primary-foreground prose-strong:text-primary-foreground prose-code:text-primary-foreground"
                      )}
                    >
                      {renderContent(msg.content, idx)}
                    </div>
                  </CardBody>
                </Card>
                {msg.createdAt && (
                  <span
                    className={clsx(
                      "text-xs text-default-400 px-1",
                      isUser ? "text-right" : "text-left"
                    )}
                  >
                    {formatTime(msg.createdAt)}
                  </span>
                )}
              </div>

              {isUser && (
                <Avatar
                  name={
                    user?.firstName?.charAt(0) ||
                    user?.email?.charAt(0).toUpperCase() ||
                    "U"
                  }
                  color="primary"
                  size="sm"
                  className="hidden md:flex shrink-0 mt-1"
                />
              )}
            </div>
          );
        })}
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

      <div className="sticky bottom-0 bg-background/80 backdrop-blur-md pt-3 pb-0 border-t border-divider z-10">
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap">
            {previewUrl && (
              <div className="relative w-fit">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-20 rounded-lg border border-divider"
                />
                <button
                  onClick={clearFile}
                  className="absolute -top-2 -right-2 bg-default-100 rounded-full p-1 hover:bg-default-200"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {selectedAgentPart && (
              <div className="relative w-fit group">
                <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative">
                  <img
                    src={selectedAgentPart.url}
                    alt={selectedAgentPart.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-1">
                    <span className="text-white text-[10px] text-center leading-tight font-medium line-clamp-3">
                      Select: {selectedAgentPart.title}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAgentPart(null)}
                  className="absolute -top-2 -right-2 bg-default-100 rounded-full p-1 hover:bg-default-200 shadow-sm border border-divider"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2 items-start">
            {messages.length === 0 && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  onChange={handleFileSelect}
                />
                <Button
                  isIconOnly
                  variant="flat"
                  onPress={() => fileInputRef.current?.click()}
                  className="mb-[2px]"
                  aria-label="Upload image"
                >
                  <ImagePlus size={24} className="text-default-500" />
                </Button>
              </>
            )}

            <Popover 
              isOpen={isRecording && (siteConfig.audioRecording.maxDuration - recordingTime <= siteConfig.audioRecording.countdownThreshold)} 
              placement="top"
            >
              <PopoverTrigger>
                <div className="inline-block">
                  <Button
                    isIconOnly
                    variant={isRecording ? "solid" : "flat"}
                    color={isRecording ? "danger" : "default"}
                    onPress={isRecording ? stopRecording : startRecording}
                    className="mb-[2px]"
                    aria-label="Record voice"
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
                    {Math.max(0, siteConfig.audioRecording.maxDuration - recordingTime)}s remaining
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Textarea
              placeholder="Type a message..."
              minRows={1}
              maxRows={5}
              value={input}
              onValueChange={setInput}
              onKeyDown={handleKeyDown}
              className="flex-1"
              classNames={{
                input: "text-base",
              }}
              isDisabled={isRecording}
            />
            <Button
              isIconOnly
              color="primary"
              aria-label="Send"
              onPress={handleSend}
              isLoading={isSending}
              isDisabled={isRecording || isTranscribing}
              className="mb-[2px]"
            >
              <Send size={20} />
            </Button>
          </div>
        </div>
      </div>

      <ImageDetailModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        selectedImage={selectedImage}
        onClose={onClose}
      />
      <NotificationPermissionModal ref={notificationModalRef} />
    </div>
  );
}
