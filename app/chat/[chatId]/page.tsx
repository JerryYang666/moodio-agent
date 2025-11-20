"use client";

import { useState, useEffect, useRef, use } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Send, Bot, User as UserIcon } from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export default function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params);
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const fetchChat = async () => {
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

    if (user) {
      fetchChat();
    }
  }, [chatId, user]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const userMessage: Message = { role: "user", content: input };
    // Add user message immediately
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch(`/api/chat/${chatId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage.content }),
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

        // Update the last message (assistant's response)
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === "assistant") {
            lastMsg.content = assistantMessageContent;
          }
          return newMessages;
        });
      }

    } catch (error) {
      console.error("Error sending message", error);
      // Optionally handle error (e.g. show error toast)
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
                  "max-w-[80%]",
                  isUser 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-default-100 dark:bg-default-50/10"
                )}
              >
                <CardBody className="p-3 overflow-x-auto">
                  <div className={clsx("prose dark:prose-invert prose-sm max-w-none", isUser && "prose-headings:text-primary-foreground prose-p:text-primary-foreground prose-strong:text-primary-foreground prose-code:text-primary-foreground")}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
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
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <Textarea
            placeholder="Type a message..."
            minRows={1}
            maxRows={5}
            value={input}
            onValueChange={setInput}
            onKeyDown={handleKeyDown}
            className="flex-1"
            classNames={{
              input: "text-base"
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
  );
}
