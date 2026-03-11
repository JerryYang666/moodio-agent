"use client";

import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Avatar } from "@heroui/avatar";
import { Image } from "@heroui/image";
import { Bot, X, Pencil, ChevronDown, ChevronRight, Brain, Maximize2 } from "lucide-react";
import clsx from "clsx";
import { Message, MessageContentPart, isGeneratedImagePart } from "@/lib/llm/types";
import ImageWithMenu from "@/components/collection/image-with-menu";
import { ImageInfo } from "./image-detail-modal";
import ImageHoverPreview from "./image-hover-preview";
import { formatTime } from "./utils";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { AI_IMAGE_DRAG_MIME } from "./asset-dnd";
import VideoPromptBlock from "./video-prompt-block";
import VideoConfigCard from "./video-config-card";
import DirectVideoCard from "./direct-video-card";
import ShotListCard from "./shot-list-card";
import ToolCallCard from "./tool-call-card";
import SearchQueryCard from "./search-query-card";
import MarkdownRenderer from "@/components/ui/markdown-renderer";

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
  onAgentExpandClick?: (part: any) => void;
  onUserImageClick?: (images: ImageInfo[], index: number) => void;
  onForkChat?: (messageIndex: number) => void;
  hideAvatar?: boolean;
  /** Desktop ID for adding video assets to desktop */
  desktopId?: string;
  /** All messages in conversation - used to find source images for video config */
  allMessages?: Message[];
  /** Callback when video creation status changes */
  onVideoStatusChange?: (
    messageIndex: number,
    partIndex: number,
    status: "pending" | "creating" | "created" | "error",
    generationId?: string
  ) => void;
  /** Callback to send a video generation from agent video card as a user message */
  onSendAsVideoMessage?: (config: {
    modelId: string;
    modelName: string;
    prompt: string;
    sourceImageId: string;
    sourceImageUrl?: string;
    params: Record<string, any>;
  }) => void;
  /** Callback when a direct_video part's status updates */
  onDirectVideoStatusUpdate?: (
    messageIndex: number,
    partIndex: number,
    updates: any
  ) => void;
  /** Callback to restore a direct_video generation's params back into the input */
  onDirectVideoRestore?: (data: import("@/components/video/video-detail-modal").VideoRestoreData) => void;
}

export default function ChatMessage({
  message,
  messageIndex,
  chatId,
  user,
  selectedImageIds,
  onAgentImageSelect,
  onAgentTitleClick,
  onAgentExpandClick,
  onUserImageClick,
  onForkChat,
  hideAvatar = false,
  desktopId,
  allMessages,
  onVideoStatusChange,
  onSendAsVideoMessage,
  onDirectVideoStatusUpdate,
  onDirectVideoRestore,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isForkPopoverOpen, setIsForkPopoverOpen] = useState(false);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.roles?.includes("admin");
  const t = useTranslations();

  // Collect source images from all messages for video config card
  const sourceImagesForVideo = useMemo(() => {
    if (!allMessages) return [];
    const images: Array<{ imageId: string; imageUrl: string; title?: string }> = [];
    for (const msg of allMessages) {
      if (!Array.isArray(msg.content)) continue;
      for (const part of msg.content) {
        if (isGeneratedImagePart(part) && part.imageId && part.imageUrl && part.status === "generated") {
          images.push({ imageId: part.imageId, imageUrl: part.imageUrl, title: part.title });
        }
        if (part.type === "image" && part.imageId && (part as any).imageUrl) {
          images.push({ imageId: part.imageId, imageUrl: (part as any).imageUrl, title: (part as any).title });
        }
      }
    }
    return images;
  }, [allMessages]);

  const handleAgentDragStart = (e: React.DragEvent, part: any) => {
    if (part.status !== "generated" || !part.imageId || !part.imageUrl) return;
    const payload = {
      imageId: part.imageId,
      url: part.imageUrl,
      title: part.title,
      prompt: part.prompt,
      status: part.status,
      chatId: chatId || null,
    };
    try {
      e.dataTransfer.setData(AI_IMAGE_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copy";
    } catch (err) {
      console.error("Failed to start AI image drag", err);
    }
  };

  const renderContent = (
    content: string | MessageContentPart[],
    msgIndex?: number,
    messageTimestamp?: number
  ) => {
    const markdownComponents = {
      code({ node, className, children, ...props }: any) {
        const match = /language-video-prompt/.exec(className || "");
        if (match) {
          const promptText = String(children).replace(/\n$/, "");
          return <VideoPromptBlock prompt={promptText} />;
        }
        // Default inline code rendering
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      pre({ children }: any) {
        // Check if the child is a video-prompt code block
        // If so, don't wrap it in <pre> to avoid double styling
        const childProps = children?.props;
        if (childProps?.className?.includes("language-video-prompt")) {
          return <>{children}</>;
        }
        return <pre>{children}</pre>;
      },
    };

    if (typeof content === "string") {
      return (
        <MarkdownRenderer components={markdownComponents}>{content}</MarkdownRenderer>
      );
    }

    // Check if message is more than 10 minutes old (10 * 60 * 1000 ms)
    const isStaleMessage =
      messageTimestamp && Date.now() - messageTimestamp > 10 * 60 * 1000;

    // Group parts by type for rendering
    const textParts = content.filter((p) => p.type === "text");
    const imageParts = content.filter(
      (p) => p.type === "image" || p.type === "image_url"
    );
    const agentParts = content.filter((p) => isGeneratedImagePart(p));
    const videoParts = content.filter((p) => p.type === "agent_video");
    const directVideoParts = content.filter((p) => p.type === "direct_video");
    const shotListParts = content.filter((p) => p.type === "agent_shot_list");
    const thinkParts = content.filter((p) => p.type === "internal_think");
    const toolCallParts = content.filter((p) => p.type === "tool_call");
    const searchParts = content.filter((p) => p.type === "agent_search");

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

        {toolCallParts.length > 0 &&
          toolCallParts.map((part: any, i) => (
            <ToolCallCard key={`tool-${i}`} tool={part.tool} status={part.status} />
          ))}

        {textParts.map((part: any, i) => (
          <MarkdownRenderer key={`text-${i}`} components={markdownComponents}>
            {part.text}
          </MarkdownRenderer>
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
                  <ImageHoverPreview key={`img-${i}`} src={url} alt={t("chat.userUpload")}>
                    <button
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
                  </ImageHoverPreview>
                );
              });
            })()}
          </div>
        )}

        {agentParts.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            {agentParts.map((part: any, i) => {
              // Use imageUrl from API response (CloudFront + signed cookies)
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
                  desktopId={desktopId}
                  generationDetails={{
                    title: part.title,
                    prompt: part.prompt,
                    status: effectiveStatus,
                  }}
                  onViewDetails={() => onAgentTitleClick(part)}
                  topRightActions={
                    effectiveStatus === "generated" && onAgentExpandClick ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="solid"
                        aria-label={t("imageDetail.viewFullSize")}
                        title={t("imageDetail.viewFullSize")}
                        className="bg-background/80 backdrop-blur-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onAgentExpandClick(part);
                        }}
                      >
                        <Maximize2 size={16} />
                      </Button>
                    ) : null
                  }
                >
                  <ImageHoverPreview
                    src={url}
                    alt={part.title}
                    maxPreviewWidth={600}
                    maxPreviewHeight={600}
                    className="block"
                    disabled={effectiveStatus !== "generated"}
                  >
                    <Card
                      className={clsx(
                        "w-full",
                        isSelected && "border-4 border-primary"
                      )}
                    >
                      <CardBody
                        className="p-0 overflow-hidden relative cursor-pointer group/image rounded-lg"
                        draggable={effectiveStatus === "generated"}
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
                        onDragStart={(e) => handleAgentDragStart(e, part)}
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
                        <div className="aspect-square w-full">
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
                        </div>
                        {(effectiveStatus === "generated" ||
                          effectiveStatus === "error") && (
                          <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-black/60 text-black dark:text-white p-2 text-xs truncate md:opacity-0 md:group-hover/image:opacity-100 transition-opacity z-10 pointer-events-none">
                            {part.title}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  </ImageHoverPreview>
                </ImageWithMenu>
              );
            })}
          </div>
        )}

        {videoParts.length > 0 &&
          videoParts.map((part: any, i) => {
            const realPartIndex = (content as MessageContentPart[]).indexOf(part);
            return (
              <VideoConfigCard
                key={`video-${i}`}
                part={part}
                sourceImages={sourceImagesForVideo}
                desktopId={desktopId}
                chatId={chatId}
                onStatusChange={(status, generationId) => {
                  if (onVideoStatusChange && msgIndex !== undefined) {
                    onVideoStatusChange(msgIndex, realPartIndex, status, generationId);
                  }
                }}
                onSendAsVideoMessage={!desktopId ? onSendAsVideoMessage : undefined}
              />
            );
          })}

        {directVideoParts.length > 0 &&
          directVideoParts.map((part: any, i) => {
            const realPartIndex = (content as MessageContentPart[]).indexOf(part);
            return (
              <DirectVideoCard
                key={`direct-video-${i}`}
                part={part}
                onStatusUpdate={(updates) => {
                  if (onDirectVideoStatusUpdate && msgIndex !== undefined) {
                    onDirectVideoStatusUpdate(msgIndex, realPartIndex, updates);
                  }
                }}
                onRestore={onDirectVideoRestore}
              />
            );
          })}

        {shotListParts.length > 0 &&
          shotListParts.map((part: any, i) => (
            <ShotListCard key={`shotlist-${i}`} part={part} />
          ))}

        {searchParts.length > 0 &&
          searchParts.map((part: any, i) => (
            <SearchQueryCard
              key={`search-${i}`}
              query={part.query}
              status={part.status}
              autoExecute={i === 0}
            />
          ))}
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
          isUser ? "max-w-[80%]" : "max-w-full w-full"
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

      {isUser && !hideAvatar && (
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
