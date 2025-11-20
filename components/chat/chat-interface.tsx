"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Send, Bot, User as UserIcon, X, ImagePlus } from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import { useRouter } from "next/navigation";
import { Message, MessageContentPart } from "@/lib/llm/types";

const AWS_S3_PUBLIC_URL = process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL || "";

// Helper to get image URL
const getImageUrl = (imageId: string) => {
  return `${AWS_S3_PUBLIC_URL}/${imageId}`;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const fetchChat = async () => {
      if (!chatId) return;

      // If we already have messages (passed from props), don't fetch unless it's a different chat logic (which it isn't here)
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
    if ((!input.trim() && !selectedFile) || isSending) return;

    const currentInput = input;
    let userMessage: Message;

    if (selectedFile && previewUrl) {
      userMessage = {
        role: "user",
        content: [
          { type: "text", text: currentInput },
          { type: "image_url", image_url: { url: previewUrl } },
        ],
      };
    } else {
      userMessage = { role: "user", content: currentInput };
    }

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    const fileToSend = selectedFile;
    clearFile();
    setIsSending(true);

    try {
      let currentChatId = chatId;

      // If no chat ID, create chat first
      if (!currentChatId) {
        const createRes = await fetch("/api/chat", { method: "POST" });
        if (!createRes.ok) throw new Error("Failed to create chat");
        const createData = await createRes.json();
        currentChatId = createData.chat.id;
        setChatId(currentChatId);

        // Update URL without reloading
        window.history.replaceState(null, "", `/chat/${currentChatId}`);

        // Dispatch event to refresh sidebar immediately upon creation
        window.dispatchEvent(new Event("refresh-chats"));
      }

      let body;
      let headers: Record<string, string> = {};

      if (fileToSend) {
        const formData = new FormData();
        formData.append("message", currentInput);
        formData.append("file", fileToSend);
        body = formData;
      } else {
        body = JSON.stringify({ content: currentInput });
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

      // Create a placeholder for the assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessageContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessageContent += chunk;

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === "assistant") {
            lastMsg.content = assistantMessageContent;
          }
          return newMessages;
        });
      }

      // If this was the first exchange (total messages <= 2),
      // wait for 3 seconds then signal the sidebar to refresh (to pick up the generated name)
      if (messages.length <= 1) {
        // checks length BEFORE this exchange is fully added to state logic wise, effectively 0 or 1 user message
        // We use a timeout to give the backend LLM name generation time to finish/propagate
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

  const renderContent = (content: string | MessageContentPart[]) => {
    if (typeof content === "string") {
      return <ReactMarkdown>{content}</ReactMarkdown>;
    }
    return (
      <div className="space-y-2">
        {content.map((part, i) => {
          if (part.type === "text") {
            return <ReactMarkdown key={i}>{part.text}</ReactMarkdown>;
          }
          if (part.type === "image") {
            return (
              <img
                key={i}
                src={getImageUrl(part.imageId)}
                alt="User upload"
                className="max-w-full rounded-lg"
                style={{ maxHeight: "300px", objectFit: "contain" }}
              />
            );
          }
          if (part.type === "image_url") {
            return (
              <img
                key={i}
                src={part.image_url.url}
                alt="User upload"
                className="max-w-full rounded-lg"
                style={{ maxHeight: "300px", objectFit: "contain" }}
              />
            );
          }
          return null;
        })}
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
          <div className="text-center text-default-500 mt-20">
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
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot size={16} className="text-primary" />
                </div>
              )}

              <Card
                className={clsx(
                  "max-w-[80%] shadow-none",
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
                    {renderContent(msg.content)}
                  </div>
                </CardBody>
              </Card>

              {isUser && (
                <div className="w-8 h-8 rounded-full bg-default-200 flex items-center justify-center shrink-0 mt-1">
                  <UserIcon size={16} className="text-default-500" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="sticky bottom-0 bg-background/80 backdrop-blur-md pt-4 pb-2 border-t border-divider z-10">
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
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
            />
            <Button
              isIconOnly
              color="primary"
              aria-label="Send"
              onPress={handleSend}
              isLoading={isSending}
              className="mb-[2px]"
            >
              <Send size={20} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
