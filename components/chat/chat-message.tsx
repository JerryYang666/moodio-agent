"use client";

import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Avatar } from "@heroui/avatar";
import { Image } from "@heroui/image";
import { Bot, X, Pencil, ChevronDown, ChevronRight, Brain, Maximize2, Monitor, Video, Music, ThumbsUp, ThumbsDown, Send, Paperclip } from "lucide-react";
import clsx from "clsx";
import { Message, MessageContentPart, isGeneratedImagePart } from "@/lib/llm/types";
import ImageWithMenu from "@/components/collection/image-with-menu";
import AudioPlayer from "@/components/audio-player";
import { ImageInfo } from "./image-detail-modal";
import ImageHoverPreview from "./image-hover-preview";
import { formatTime } from "./utils";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { addToast } from "@heroui/toast";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { AI_IMAGE_DRAG_MIME, AI_TEXT_DRAG_MIME, AI_VIDEO_SUGGEST_DRAG_MIME } from "./asset-dnd";
import SendToDesktopModal from "@/components/desktop/SendToDesktopModal";
import { getViewportVisibleCenterPosition } from "@/lib/desktop/types";
import VideoPromptBlock from "./video-prompt-block";
import VideoConfigCard from "./video-config-card";
import DirectVideoCard from "./direct-video-card";
import ShotListCard from "./shot-list-card";
import ToolCallCard from "./tool-call-card";
import SearchQueryCard from "./search-query-card";
import VideoSuggestCard from "./video-suggest-card";
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
  onAgentTitleClick: (part: any, messageIndex?: number) => void;
  onAgentExpandClick?: (part: any, messageIndex?: number) => void;
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
  /** Callback when a user edits a message content part (e.g. agent_video, agent_video_suggest) */
  onPartUpdate?: (
    messageTimestamp: number,
    messageVariantId: string | undefined,
    partType: string,
    partTypeIndex: number,
    updates: any
  ) => Promise<void> | void;
  /** Callback when a user edits an agent_video_suggest part (title/videoIdea) */
  onVideoSuggestPartUpdate?: (
    messageTimestamp: number,
    messageVariantId: string | undefined,
    partTypeIndex: number,
    updates: { title: string; videoIdea: string }
  ) => Promise<void> | void;
  /** Optional action rendered inline with the timestamp row */
  timestampAction?: React.ReactNode;
  /** Show loading spinner in place of timestamp (assistant streaming) */
  isTimestampLoading?: boolean;
  /** Callback when user long-hovers on an agent image (1.5s+) */
  onImageHoverTrack?: (data: {
    imageId: string;
    turnIndex: number;
    imagePosition: number;
    variantId?: string;
    durationMs: number;
  }) => void;
  /** Current feedback value for this message */
  feedbackValue?: { thumbs: "up" | "down"; comment?: string } | null;
  /** Callback when user gives feedback (thumbs up/down/remove) */
  onFeedback?: (
    messageTimestamp: number,
    variantId: string | undefined,
    value: { thumbs: "up" | "down"; comment?: string } | null
  ) => void;
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
  onPartUpdate,
  onVideoSuggestPartUpdate,
  timestampAction,
  isTimestampLoading = false,
  onImageHoverTrack,
  feedbackValue,
  onFeedback,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isForkPopoverOpen, setIsForkPopoverOpen] = useState(false);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const [isMediaRefsOpen, setIsMediaRefsOpen] = useState(false);
  const [showDownComment, setShowDownComment] = useState(false);
  const [downComment, setDownComment] = useState("");
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.roles?.includes("admin");
  const t = useTranslations();

  // --- Send-text-to-desktop state ---
  const [textContextMenu, setTextContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);
  const [sendToDesktopOpen, setSendToDesktopOpen] = useState(false);
  const [pendingTextForDesktop, setPendingTextForDesktop] = useState("");

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!textContextMenu) return;
    const dismiss = () => setTextContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [textContextMenu]);

  const handleTextContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isUser) return;
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (!selectedText) return;
      e.preventDefault();
      setTextContextMenu({ x: e.clientX, y: e.clientY, selectedText });
    },
    [isUser]
  );

  const handleSendTextToDesktop = useCallback(async () => {
    if (!textContextMenu?.selectedText) return;
    const selectedText = textContextMenu.selectedText;
    setTextContextMenu(null);

    if (desktopId) {
      try {
        const pos = getViewportVisibleCenterPosition(300, 200);
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [{
              assetType: "text",
              metadata: { content: selectedText, chatId: chatId || undefined },
              posX: pos.x,
              posY: pos.y,
            }],
          }),
        });
        if (!res.ok) throw new Error("Failed to send text");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
        addToast({ title: t("desktop.textSentToDesktop"), color: "success" });
      } catch {
        addToast({ title: t("desktop.failedToSendText"), color: "danger" });
      }
    } else {
      setPendingTextForDesktop(selectedText);
      setSendToDesktopOpen(true);
    }
  }, [textContextMenu, desktopId, chatId, t]);

  const handleTextDragStart = useCallback(
    (e: React.DragEvent) => {
      if (isUser || !desktopId) return;
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (!selectedText) return;
      try {
        e.dataTransfer.setData(
          AI_TEXT_DRAG_MIME,
          JSON.stringify({ content: selectedText, chatId: chatId || null })
        );
        e.dataTransfer.effectAllowed = "copy";
      } catch {
        // ignore
      }
    },
    [isUser, desktopId, chatId]
  );

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

  const sourceVideosForVideo = useMemo(() => {
    if (!allMessages) return [];
    const videos: Array<{ videoId: string; videoUrl: string }> = [];
    for (const msg of allMessages) {
      if (!Array.isArray(msg.content)) continue;
      for (const part of msg.content) {
        if (part.type === "video" && (part as any).videoId && (part as any).videoUrl) {
          videos.push({ videoId: (part as any).videoId, videoUrl: (part as any).videoUrl });
        }
        if (part.type === "direct_video" && (part as any).generationId) {
          const p = part as any;
          if (p.videoUrl) {
            videos.push({ videoId: p.generationId, videoUrl: p.videoUrl });
          }
        }
      }
    }
    return videos;
  }, [allMessages]);

  const sourceAudiosForVideo = useMemo(() => {
    if (!allMessages) return [];
    const audios: Array<{ audioId: string; audioUrl: string }> = [];
    for (const msg of allMessages) {
      if (!Array.isArray(msg.content)) continue;
      for (const part of msg.content) {
        if (part.type === "audio" && (part as any).audioId && (part as any).audioUrl) {
          audios.push({ audioId: (part as any).audioId, audioUrl: (part as any).audioUrl });
        }
      }
    }
    return audios;
  }, [allMessages]);

  const handleAgentDragStart = (e: React.DragEvent, part: any) => {
    if (part.status !== "generated" || !part.imageId || !part.imageUrl) return;
    const payload = {
      imageId: part.imageId,
      url: part.imageUrl,
      title: part.title,
      prompt: part.prompt,
      status: part.status,
      aspectRatio: part.aspectRatio || undefined,
      chatId: chatId || null,
    };
    try {
      e.dataTransfer.setData(AI_IMAGE_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copy";
    } catch (err) {
      console.error("Failed to start AI image drag", err);
    }
  };

  const handleVideoSuggestDragStart = (e: React.DragEvent, part: any) => {
    if (part.status !== "generated" || !part.imageId || !part.imageUrl) return;
    const payload = {
      imageId: part.imageId,
      url: part.imageUrl,
      title: part.title || "",
      videoIdea: part.videoIdea || "",
      prompt: part.prompt || "",
      aspectRatio: part.aspectRatio || "",
      chatId: chatId || null,
    };
    try {
      e.dataTransfer.setData(AI_VIDEO_SUGGEST_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copy";
    } catch (err) {
      console.error("Failed to start video suggest drag", err);
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

    const proseClasses = clsx(
      "prose prose-sm max-w-none",
      "[--tw-prose-body:currentColor] [--tw-prose-headings:currentColor] [--tw-prose-bold:currentColor] [--tw-prose-counters:currentColor] [--tw-prose-bullets:currentColor] [--tw-prose-code:currentColor] [--tw-prose-links:currentColor]"
    );

    if (typeof content === "string") {
      return (
        <div className={proseClasses}>
          <MarkdownRenderer components={markdownComponents}>{content}</MarkdownRenderer>
        </div>
      );
    }

    // Check if message is more than 10 minutes old (10 * 60 * 1000 ms)
    const isStaleMessage =
      messageTimestamp && Date.now() - messageTimestamp > 10 * 60 * 1000;

    // Meta parts always rendered at top
    const thinkParts = content.filter((p) => p.type === "internal_think");
    const toolCallParts = content.filter((p) => p.type === "tool_call");

    // Content parts in insertion order (everything except meta)
    const orderedParts = content.filter(
      (p) => p.type !== "internal_think" && p.type !== "tool_call"
    );

    // Group consecutive same-type parts so e.g. 4 agent images still render in a grid
    type ContentGroup = { groupType: string; parts: MessageContentPart[] };
    const groups: ContentGroup[] = [];
    for (const part of orderedParts) {
      const gt = part.type === "agent_video_suggest"
        ? "agent_video_suggest"
        : isGeneratedImagePart(part) ? "agent_image" : part.type;
      const last = groups[groups.length - 1];
      if (last && last.groupType === gt) {
        last.parts.push(part);
      } else {
        groups.push({ groupType: gt, parts: [part] });
      }
    }

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

        {groups.map((group, gi) => {
          switch (group.groupType) {
            case "text":
              return group.parts.map((part: any, i) => (
                <div key={`text-${gi}-${i}`} className={proseClasses}>
                  <MarkdownRenderer components={markdownComponents}>
                    {part.text}
                  </MarkdownRenderer>
                </div>
              ));

            case "image":
            case "image_url":
              if (!isUser) return null;
              return (
                <div key={`user-images-${gi}`} className="flex gap-2 overflow-x-auto pb-1">
                  {(() => {
                    const images: ImageInfo[] = group.parts
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

                    return group.parts.map((part: any, i) => {
                      const url =
                        part.type === "image"
                          ? part.imageUrl || ""
                          : part.image_url.url;
                      if (!url) return null;
                      // In-chat tile uses the md thumbnail when available
                      // (image parts). image_url parts (non-persisted inline
                      // image references) never have a thumbnail and render
                      // the original URL. Hover preview and the enlarge
                      // modal continue to load the original.
                      const tileSrc =
                        (part.type === "image" && part.thumbnailMdUrl) || url;
                      return (
                        <ImageHoverPreview key={`img-${gi}-${i}`} src={url} alt={t("chat.userUpload")}>
                          <button
                            type="button"
                            onClick={() =>
                              onUserImageClick && onUserImageClick(images, i)
                            }
                            className="h-20 w-20 rounded-lg border border-divider overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <img
                              src={tileSrc}
                              alt={t("chat.userUpload")}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                if (url && e.currentTarget.src !== url) {
                                  e.currentTarget.src = url;
                                }
                              }}
                            />
                          </button>
                        </ImageHoverPreview>
                      );
                    });
                  })()}
                </div>
              );

            case "video":
              if (!isUser) return null;
              return (
                <div key={`user-videos-${gi}`} className="flex gap-2 overflow-x-auto pb-1">
                  {group.parts.map((part: any, i) => (
                    <div
                      key={`vid-${gi}-${i}`}
                      className="h-20 w-20 rounded-lg border border-divider overflow-hidden shrink-0 relative bg-black"
                    >
                      {part.videoUrl ? (
                        <video
                          src={part.videoUrl}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Video size={20} className="text-default-400" />
                        </div>
                      )}
                      <div className="absolute top-1 left-1 z-10">
                        <span className="text-[9px] font-semibold bg-danger/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Video size={8} />
                          {t("chat.videoLabel")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );

            case "audio":
              if (!isUser) return null;
              return (
                <div key={`user-audios-${gi}`} className="flex gap-2 overflow-x-auto pb-1">
                  {group.parts.map((part: any, i) => (
                    <div
                      key={`aud-${gi}-${i}`}
                      className="h-20 w-48 rounded-lg border border-divider overflow-hidden shrink-0 relative bg-secondary/5"
                    >
                      {part.audioUrl ? (
                        <div className="h-full w-full flex items-center px-2">
                          <AudioPlayer src={part.audioUrl} variant="compact" title={part.title} />
                        </div>
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Music size={20} className="text-default-400" />
                        </div>
                      )}
                      <div className="absolute top-1 left-1 z-10">
                        <span className="text-[9px] font-semibold bg-secondary/90 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Music size={8} />
                          {t("chat.audioLabel")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );

            case "agent_image":
              return (
                <div key={`agent-images-${gi}`} className="grid grid-cols-2 gap-3 mt-2">
                  {group.parts.map((part: any, i) => {
                    const url = part.imageUrl || "";
                    // In-chat grid renders the md thumbnail. Hover preview
                    // and the enlarge modal continue to load the original
                    // via `url` below.
                    const gridSrc = part.thumbnailMdUrl || url;
                    const isSelected =
                      (part.imageId && selectedImageIds.includes(part.imageId)) ||
                      part.isSelected;

                    const realPartIndex = (content as MessageContentPart[]).indexOf(
                      part
                    );

                    const effectiveStatus =
                      part.status === "loading" && isStaleMessage
                        ? "error"
                        : part.status;

                    return (
                      <ImageWithMenu
                        key={`agent-${gi}-${i}`}
                        imageId={part.imageId || ""}
                        imageUrl={url}
                        chatId={chatId}
                        messageTimestamp={message.createdAt}
                        desktopId={desktopId}
                        generationDetails={{
                          title: part.title,
                          prompt: part.prompt,
                          status: effectiveStatus,
                        }}
                        onViewDetails={() => onAgentTitleClick(part, msgIndex)}
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
                                onAgentExpandClick(part, msgIndex);
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
                          onHoverTrack={
                            onImageHoverTrack && part.imageId
                              ? (durationMs) =>
                                  onImageHoverTrack({
                                    imageId: part.imageId!,
                                    turnIndex: messageIndex,
                                    imagePosition: i,
                                    variantId: message.variantId,
                                    durationMs,
                                  })
                              : undefined
                          }
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
                                  onAgentTitleClick(part, msgIndex);
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
                                  src={gridSrc}
                                  alt={part.title}
                                  radius="none"
                                  classNames={{
                                    wrapper: "w-full h-full !max-w-full",
                                    img: "w-full h-full object-contain bg-default-100 dark:bg-black",
                                  }}
                                  onError={
                                    ((e: React.SyntheticEvent<HTMLImageElement>) => {
                                      const target = e.currentTarget;
                                      if (url && target.src !== url) {
                                        target.src = url;
                                      }
                                    }) as unknown as () => void
                                  }
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
              );

            case "agent_video_suggest": {
              // Track the index of each agent_video_suggest within the full content
              // so we can map each card to its partTypeIndex for editing
              let videoSuggestTypeIndex = 0;
              const orderedContent = content as MessageContentPart[];
              for (const p of orderedContent) {
                if (p === group.parts[0]) break;
                if (p.type === "agent_video_suggest") videoSuggestTypeIndex++;
              }

              return (
                <div key={`video-suggest-${gi}`} className="grid grid-cols-1 gap-3 mt-2">
                  {group.parts.map((part: any, i) => {
                    const isSelected =
                      (part.imageId && selectedImageIds.includes(part.imageId)) ||
                      part.isSelected;

                    const realPartIndex = orderedContent.indexOf(part);

                    const effectiveStatus =
                      part.status === "loading" && isStaleMessage
                        ? "error"
                        : part.status;

                    const currentPartTypeIndex = videoSuggestTypeIndex + i;

                    return (
                      <VideoSuggestCard
                        key={`video-suggest-${gi}-${i}`}
                        part={part}
                        isSelected={isSelected}
                        effectiveStatus={effectiveStatus}
                        draggable={effectiveStatus === "generated"}
                        onDragStart={(e) => handleVideoSuggestDragStart(e, part)}
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
                        onExpandClick={onAgentExpandClick}
                        onSave={
                          onVideoSuggestPartUpdate && message.createdAt
                            ? (updates) =>
                                onVideoSuggestPartUpdate(
                                  message.createdAt!,
                                  message.variantId,
                                  currentPartTypeIndex,
                                  updates
                                )
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              );
            }

            case "agent_video":
              return group.parts.map((part: any, i) => {
                const realPartIndex = (content as MessageContentPart[]).indexOf(part);
                return (
                  <VideoConfigCard
                    key={`video-${gi}-${i}`}
                    part={part}
                    sourceImages={sourceImagesForVideo}
                    sourceVideos={sourceVideosForVideo}
                    sourceAudios={sourceAudiosForVideo}
                    desktopId={desktopId}
                    chatId={chatId}
                    onStatusChange={(status, generationId) => {
                      if (onVideoStatusChange && msgIndex !== undefined) {
                        onVideoStatusChange(msgIndex, realPartIndex, status, generationId);
                      }
                    }}
                    onSendAsVideoMessage={!desktopId ? onSendAsVideoMessage : undefined}
                    onPartUpdate={(updates) => {
                      if (onPartUpdate && message.createdAt) {
                        return onPartUpdate(
                          message.createdAt,
                          message.variantId,
                          "agent_video",
                          i,
                          updates
                        );
                      }
                    }}
                  />
                );
              });

            case "direct_video":
              return group.parts.map((part: any, i) => {
                const realPartIndex = (content as MessageContentPart[]).indexOf(part);
                return (
                  <DirectVideoCard
                    key={`direct-video-${gi}-${i}`}
                    part={part}
                    onStatusUpdate={(updates) => {
                      if (onDirectVideoStatusUpdate && msgIndex !== undefined) {
                        onDirectVideoStatusUpdate(msgIndex, realPartIndex, updates);
                      }
                    }}
                    onRestore={onDirectVideoRestore}
                  />
                );
              });

            case "agent_shot_list":
              return group.parts.map((part: any, i) => (
                <ShotListCard key={`shotlist-${gi}-${i}`} part={part} desktopId={desktopId} chatId={chatId} />
              ));

            case "agent_search":
              return group.parts.map((part: any, i) => (
                <SearchQueryCard
                  key={`search-${gi}-${i}`}
                  query={(part as any).query}
                  status={(part as any).status}
                  autoExecute={gi === 0 && i === 0}
                  desktopId={desktopId}
                />
              ));

            case "media_references":
              return group.parts.map((part: any, i) => {
                const refs = part.references || [];
                const imageRefs = refs.filter((r: any) => r.refType === "image");
                const videoRefs = refs.filter((r: any) => r.refType === "video");
                const audioRefs = refs.filter((r: any) => r.refType === "audio");

                const counts: string[] = [];
                if (imageRefs.length > 0) counts.push(`${imageRefs.length} ${imageRefs.length === 1 ? t("chat.imageLabel") : t("chat.imagesLabel")}`);
                if (videoRefs.length > 0) counts.push(`${videoRefs.length} ${videoRefs.length === 1 ? t("chat.videoLabel") : t("chat.videosLabel")}`);
                if (audioRefs.length > 0) counts.push(`${audioRefs.length} ${audioRefs.length === 1 ? t("chat.audioLabel") : t("chat.audiosLabel")}`);

                return (
                  <div key={`media-refs-${gi}-${i}`}>
                    <button
                      onClick={() => setIsMediaRefsOpen(!isMediaRefsOpen)}
                      className="flex items-center gap-2 text-xs opacity-70 hover:opacity-100 transition-opacity w-full"
                    >
                      {isMediaRefsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <Paperclip size={14} />
                      <span>{t("chat.mediaReferences", { count: refs.length })} ({counts.join(", ")})</span>
                    </button>
                    {isMediaRefsOpen && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {refs.map((ref: any, ri: number) => {
                          const label =
                            ref.refType === "video" ? `@video${videoRefs.indexOf(ref) + 1}` :
                            ref.refType === "audio" ? `@audio${audioRefs.indexOf(ref) + 1}` :
                            `@image${imageRefs.indexOf(ref) + 1}`;
                          return (
                            <div
                              key={`ref-${ri}`}
                              className="h-16 w-16 rounded-lg border border-divider overflow-hidden shrink-0 relative bg-default-100"
                            >
                              {ref.refType === "image" && ref.url ? (
                                <img src={ref.url} alt={label} className="h-full w-full object-cover" />
                              ) : ref.refType === "video" && ref.url ? (
                                <video src={ref.url} className="h-full w-full object-cover" muted />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  {ref.refType === "video" ? <Video size={16} className="opacity-40" /> :
                                   ref.refType === "audio" ? <Music size={16} className="opacity-40" /> :
                                   <Paperclip size={16} className="opacity-40" />}
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white text-center py-0.5">
                                {label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });

            default:
              return null;
          }
        })}
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
              onContextMenu={handleTextContextMenu}
              onDragStart={handleTextDragStart}
            >
              {renderContent(message.content, messageIndex, message.createdAt)}
            </div>
          </CardBody>
        </Card>

        {/* Context menu: Send selected text to Desktop */}
        {textContextMenu && (
          <div
            className="fixed z-50 min-w-[180px] rounded-lg border border-divider bg-background shadow-lg py-1"
            style={{ left: textContextMenu.x, top: textContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
              onClick={handleSendTextToDesktop}
            >
              <Monitor size={14} />
              {t("chat.sendSelectionToDesktop")}
            </button>
          </div>
        )}

        {/* Desktop picker modal for text (when not on desktop page) */}
        <SendToDesktopModal
          isOpen={sendToDesktopOpen}
          onOpenChange={setSendToDesktopOpen}
          assets={
            pendingTextForDesktop
              ? [{ assetType: "text", metadata: { content: pendingTextForDesktop, chatId: chatId || undefined, messageTimestamp: message.createdAt } }]
              : []
          }
          desktopId={desktopId}
        />
        {(message.createdAt || isTimestampLoading) && (
          <div
            className={clsx(
              "flex items-center gap-2",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            {isTimestampLoading ? (
              <Spinner
                variant="dots"
                size="md"
                className="px-1 scale-75 origin-left"
              />
            ) : (
              <span className="text-xs text-default-400 px-1">
                {formatTime(message.createdAt)}
              </span>
            )}
            {!isUser && !isTimestampLoading && onFeedback && message.createdAt && (
              <div className={clsx(
                "flex items-center gap-0.5",
                !feedbackValue && "md:opacity-0 md:group-hover:opacity-100",
                "transition-opacity"
              )}>
                <button
                  onClick={() => {
                    if (!message.createdAt) return;
                    if (feedbackValue?.thumbs === "up") {
                      onFeedback(message.createdAt, message.variantId, null);
                    } else {
                      setShowDownComment(false);
                      setDownComment("");
                      onFeedback(message.createdAt, message.variantId, { thumbs: "up" });
                    }
                  }}
                  className={clsx(
                    "p-1 rounded-full transition-colors",
                    feedbackValue?.thumbs === "up"
                      ? "text-success-500 bg-success-50"
                      : "text-default-400 hover:text-default-600 hover:bg-default-100"
                  )}
                  aria-label="Thumbs up"
                >
                  <ThumbsUp size={12} fill={feedbackValue?.thumbs === "up" ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => {
                    if (!message.createdAt) return;
                    if (feedbackValue?.thumbs === "down") {
                      onFeedback(message.createdAt, message.variantId, null);
                      setShowDownComment(false);
                      setDownComment("");
                    } else {
                      onFeedback(message.createdAt, message.variantId, { thumbs: "down" });
                      setShowDownComment(true);
                    }
                  }}
                  className={clsx(
                    "p-1 rounded-full transition-colors",
                    feedbackValue?.thumbs === "down"
                      ? "text-danger-500 bg-danger-50"
                      : "text-default-400 hover:text-default-600 hover:bg-default-100"
                  )}
                  aria-label="Thumbs down"
                >
                  <ThumbsDown size={12} fill={feedbackValue?.thumbs === "down" ? "currentColor" : "none"} />
                </button>
              </div>
            )}
            {!isUser && timestampAction && (
              <div className="ml-auto">{timestampAction}</div>
            )}
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
        {!isUser && showDownComment && feedbackValue?.thumbs === "down" && onFeedback && message.createdAt && (
          <div className="flex items-start gap-1.5 mt-1 max-w-sm">
            <textarea
              value={downComment}
              onChange={(e) => setDownComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!message.createdAt) return;
                  onFeedback(message.createdAt, message.variantId, {
                    thumbs: "down",
                    comment: downComment.trim() || undefined,
                  });
                  setShowDownComment(false);
                  setDownComment("");
                }
              }}
              placeholder="What went wrong?"
              maxLength={1000}
              rows={1}
              className="flex-1 text-xs bg-default-100 rounded-lg px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-default-300 text-default-700 placeholder:text-default-400"
            />
            <button
              onClick={() => {
                if (!message.createdAt) return;
                onFeedback(message.createdAt, message.variantId, {
                  thumbs: "down",
                  comment: downComment.trim() || undefined,
                });
                setShowDownComment(false);
                setDownComment("");
              }}
              className="p-1.5 rounded-full text-default-500 hover:text-primary hover:bg-default-100 transition-colors"
              aria-label="Submit comment"
            >
              <Send size={12} />
            </button>
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
