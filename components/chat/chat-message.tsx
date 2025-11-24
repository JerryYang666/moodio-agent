"use client";

import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Avatar } from "@heroui/avatar";
import { Bot, X, Pencil } from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import { Message, MessageContentPart } from "@/lib/llm/types";
import ImageWithMenu from "@/components/collection/image-with-menu";
import { getImageUrl, formatTime } from "./utils";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { useState } from "react";

interface SelectedAgentPart {
  url: string;
  title: string;
  messageIndex: number;
  partIndex: number;
}

interface ChatMessageProps {
  message: Message;
  messageIndex: number;
  chatId?: string;
  user?: {
    firstName?: string | null;
    email?: string | null;
  } | null;
  selectedAgentPart: SelectedAgentPart | null;
  onAgentImageSelect: (
    part: any,
    messageIndex: number,
    partIndex: number
  ) => void;
  onAgentTitleClick: (part: any) => void;
  onForkChat?: (messageIndex: number) => void;
}

export default function ChatMessage({
  message,
  messageIndex,
  chatId,
  user,
  selectedAgentPart,
  onAgentImageSelect,
  onAgentTitleClick,
  onForkChat,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isForkPopoverOpen, setIsForkPopoverOpen] = useState(false);

  const renderContent = (
    content: string | MessageContentPart[],
    msgIndex?: number,
    messageTimestamp?: number
  ) => {
    if (typeof content === "string") {
      return <ReactMarkdown>{content}</ReactMarkdown>;
    }

    // Check if message is more than 10 minutes old (10 * 60 * 1000 ms)
    const isStaleMessage =
      messageTimestamp && Date.now() - messageTimestamp > 10 * 60 * 1000;

    // Group parts by type for rendering
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
                  selectedAgentPart?.messageIndex === msgIndex) ||
                part.isSelected;

              const realPartIndex = (content as MessageContentPart[]).indexOf(
                part
              );

              // Show error if image is loading but message is more than 10 minutes old
              const effectiveStatus =
                part.status === "loading" && isStaleMessage
                  ? "error"
                  : part.status;

              return (
                <ImageWithMenu
                  key={`agent-${i}`}
                  imageId={part.imageId || ""}
                  imageUrl={url}
                  chatId={chatId}
                  generationDetails={{
                    title: part.title,
                    prompt: part.prompt,
                    status: effectiveStatus,
                  }}
                  onViewDetails={() => onAgentTitleClick(part)}
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
                        effectiveStatus === "generated" &&
                        msgIndex !== undefined &&
                        onAgentImageSelect(part, msgIndex, realPartIndex)
                      }
                    >
                      {effectiveStatus === "loading" && (
                        <div className="w-full h-full flex items-center justify-center bg-default-100">
                          <Spinner />
                        </div>
                      )}
                      {effectiveStatus === "error" && (
                        <div className="w-full h-full flex items-center justify-center bg-danger-50 text-danger">
                          <X />
                        </div>
                      )}
                      {effectiveStatus === "generated" && (
                        <img
                          src={url}
                          alt={part.title}
                          className="w-full h-full object-contain bg-default-100 dark:bg-black"
                        />
                      )}
                      {(effectiveStatus === "generated" ||
                        effectiveStatus === "error") && (
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

  return (
    <div
      className={clsx(
        "flex gap-3 max-w-3xl mx-auto group",
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
              {renderContent(message.content, messageIndex, message.createdAt)}
            </div>
          </CardBody>
        </Card>
        {message.createdAt && (
          <div
            className={clsx(
              "flex items-center gap-2",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            <span className="text-xs text-default-400 px-1">
              {formatTime(message.createdAt)}
            </span>
            {isUser && messageIndex > 0 && onForkChat && (
              <Popover
                isOpen={isForkPopoverOpen}
                onOpenChange={setIsForkPopoverOpen}
                placement="bottom-end"
              >
                <PopoverTrigger>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-default-100 rounded-full text-default-400 hover:text-default-600"
                    aria-label="Edit message"
                  >
                    <Pencil size={12} />
                  </button>
                </PopoverTrigger>
                <PopoverContent>
                  <div className="px-1 py-2 w-60">
                    <div className="text-small font-bold mb-1">
                      Edit in new chat?
                    </div>
                    <div className="text-tiny text-default-500 mb-2">
                      This will create a new chat starting from here, preserving
                      the conversation history up to this point.
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => setIsForkPopoverOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        color="primary"
                        onPress={() => {
                          setIsForkPopoverOpen(false);
                          onForkChat(messageIndex);
                        }}
                      >
                        Edit & Fork
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
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
}
