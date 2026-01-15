"use client";

import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Avatar } from "@heroui/avatar";
import { Image } from "@heroui/image";
import { Bot, X, Pencil, ChevronDown, ChevronRight, Brain } from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import { Message, MessageContentPart } from "@/lib/llm/types";
import ImageWithMenu from "@/components/collection/image-with-menu";
import { ImageInfo } from "./image-detail-modal";
import { formatTime } from "./utils";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";

interface ChatMessageProps {
  message: Message;
  messageIndex: number;
  chatId?: string;
  user?: {
    firstName?: string | null;
    email?: string | null;
  } | null;
  /** Array of image IDs that are currently selected/pending */
  selectedImageIds: string[];
  onAgentImageSelect: (
    part: any,
    messageIndex: number,
    partIndex: number,
    variantId?: string
  ) => void;
  onAgentTitleClick: (part: any) => void;
  onUserImageClick?: (images: ImageInfo[], index: number) => void;
  onForkChat?: (messageIndex: number) => void;
  hideAvatar?: boolean;
}

export default function ChatMessage({
  message,
  messageIndex,
  chatId,
  user,
  selectedImageIds,
  onAgentImageSelect,
  onAgentTitleClick,
  onUserImageClick,
  onForkChat,
  hideAvatar = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isForkPopoverOpen, setIsForkPopoverOpen] = useState(false);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.roles?.includes("admin");
  const t = useTranslations();

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
    const thinkParts = content.filter((p) => p.type === "internal_think");

    return (
      <div className="space-y-4">
        {isAdmin && thinkParts.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setIsThinkingOpen(!isThinkingOpen)}
              className="flex items-center gap-2 text-xs text-default-400 hover:text-default-600 transition-colors w-full"
            >
              {isThinkingOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <Brain size={14} />
              <span>{t("chat.thinkingProcess")}</span>
            </button>
            {isThinkingOpen && (
              <div className="mt-2 p-3 bg-default-100 rounded-lg text-xs font-mono text-default-600 whitespace-pre-wrap border border-default-200">
                {thinkParts.map((part: any, i) => (
                  <div key={`think-${i}`}>{part.text}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {textParts.map((part: any, i) => (
          <ReactMarkdown key={`text-${i}`}>{part.text}</ReactMarkdown>
        ))}

        {isUser && imageParts.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(() => {
              const images: ImageInfo[] = imageParts
                .map((p: any) => {
                  const imageUrl =
                    p.type === "image" ? p.imageUrl || "" : p.image_url.url;
                  if (!imageUrl) return null;
                  return {
                    url: imageUrl,
                    title: t("chat.image"),
                    prompt: undefined,
                    imageId: p.type === "image" ? p.imageId : undefined,
                  };
                })
                .filter(Boolean) as ImageInfo[];

              return imageParts.map((part: any, i) => {
                const url =
                  part.type === "image"
                    ? part.imageUrl || ""
                    : part.image_url.url;
                if (!url) return null;
                return (
                  <button
                    key={`img-${i}`}
                    type="button"
                    onClick={() =>
                      onUserImageClick && onUserImageClick(images, i)
                    }
                    className="h-20 w-20 rounded-lg border border-divider overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <img
                      src={url}
                      alt={t("chat.userUpload")}
                      className="h-full w-full object-cover"
                    />
                  </button>
                );
              });
            })()}
          </div>
        )}

        {agentParts.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            {agentParts.map((part: any, i) => {
              // Use imageUrl from API response (CloudFront signed URL)
              const url = part.imageUrl || "";
              // Check if this image is selected by checking if its imageId is in selectedImageIds
              const isSelected =
                (part.imageId && selectedImageIds.includes(part.imageId)) ||
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
                        onAgentImageSelect(
                          part,
                          msgIndex,
                          realPartIndex,
                          message.variantId
                        )
                      }
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        if (
                          effectiveStatus === "generated" ||
                          effectiveStatus === "error"
                        ) {
                          onAgentTitleClick(part);
                        }
                      }}
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
                        <Image
                          src={url}
                          alt={part.title}
                          radius="none"
                          classNames={{
                            wrapper: "w-full h-full !max-w-full",
                            img: "w-full h-full object-contain bg-default-100 dark:bg-black",
                          }}
                        />
                      )}
                      {(effectiveStatus === "generated" ||
                        effectiveStatus === "error") && (
                        <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-black/60 text-black dark:text-white p-2 text-xs truncate md:opacity-0 md:group-hover/image:opacity-100 transition-opacity z-10 pointer-events-none">
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
      {!isUser && !hideAvatar && (
        <div className="hidden md:flex w-8 h-8 rounded-full bg-primary/10 items-center justify-center shrink-0 mt-1">
          <Bot size={16} className="text-primary" />
        </div>
      )}

      <div
        className={clsx(
          "flex flex-col gap-1",
          isUser ? "max-w-[80%]" : "max-w-full"
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
                    className="md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 hover:bg-default-100 rounded-full text-default-400 hover:text-default-600"
                    aria-label={t("chat.editMessage")}
                  >
                    <Pencil size={12} />
                  </button>
                </PopoverTrigger>
                <PopoverContent>
                  <div className="px-1 py-2 w-60">
                    <div className="text-small font-bold mb-1">
                      {t("chat.editInNewChatTitle")}
                    </div>
                    <div className="text-tiny text-default-500 mb-2">
                      {t("chat.editInNewChatDescription")}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => setIsForkPopoverOpen(false)}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        size="sm"
                        color="primary"
                        onPress={() => {
                          setIsForkPopoverOpen(false);
                          onForkChat(messageIndex);
                        }}
                      >
                        {t("chat.editAndFork")}
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
