"use client";

import { useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Switch } from "@heroui/switch";
import { Tooltip } from "@heroui/tooltip";
import { Spinner } from "@heroui/spinner";
import { siteConfig } from "@/config/site";
import {
  Send,
  X,
  ImagePlus,
  Mic,
  Square,
  Info,
  Upload,
  Library,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MenuConfiguration, { MenuState } from "./menu-configuration";
import { PendingImage, MAX_PENDING_IMAGES } from "./pending-image-types";
import clsx from "clsx";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  recordingTime: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  pendingImages: PendingImage[];
  onRemovePendingImage: (imageId: string) => void;
  onOpenAssetPicker: () => void;
  onAssetDrop: (payload: {
    assetId: string;
    imageId?: string;
    url?: string;
    title?: string;
  }) => void;
  showFileUpload: boolean;
  precisionEditing: boolean;
  onPrecisionEditingChange: (value: boolean) => void;
  menuState: MenuState;
  onMenuStateChange: (newState: MenuState) => void;
  hasUploadingImages: boolean;
}

export default function ChatInput({
  input,
  onInputChange,
  onSend,
  isSending,
  isRecording,
  isTranscribing,
  recordingTime,
  onStartRecording,
  onStopRecording,
  pendingImages,
  onRemovePendingImage,
  onOpenAssetPicker,
  onAssetDrop,
  showFileUpload,
  precisionEditing,
  onPrecisionEditingChange,
  menuState,
  onMenuStateChange,
  hasUploadingImages,
}: ChatInputProps) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const json = e.dataTransfer.getData("application/x-moodio-asset");
      if (json) {
        const parsed = JSON.parse(json);
        if (parsed?.assetId) {
          onAssetDrop(parsed);
          return;
        }
      }
      const fallbackId = e.dataTransfer.getData("text/plain");
      if (fallbackId) {
        onAssetDrop({ assetId: fallbackId });
      }
    } catch (err) {
      console.error("Failed to parse dropped asset", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  // Handle click outside to collapse
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        const target = event.target as Element;

        // Don't collapse if interacting with a portal (dropdown, popover, etc.)
        if (
          target.closest(
            "[data-overlay], [data-state='open'], [role='listbox'], [role='menu']"
          )
        ) {
          return;
        }

        // Don't collapse if audio recording or transcription is in progress
        if (isRecording || isTranscribing) {
          return;
        }

        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRecording, isTranscribing]);

  // Auto-expand if there are attachments or recording
  useEffect(() => {
    if (pendingImages.length > 0 || isRecording) {
      setIsExpanded(true);
    }
  }, [pendingImages.length, isRecording]);

  // Helper to get source icon for pending image
  const getSourceIcon = (source: PendingImage["source"]) => {
    switch (source) {
      case "upload":
        return <Upload size={10} />;
      case "asset":
        return <Library size={10} />;
      case "ai_generated":
        return <Sparkles size={10} />;
    }
  };

  // Helper to get source label for pending image
  const getSourceLabel = (source: PendingImage["source"]) => {
    switch (source) {
      case "upload":
        return t("chat.sourceUpload");
      case "asset":
        return t("chat.sourceAsset");
      case "ai_generated":
        return t("chat.sourceAiGenerated");
    }
  };

  return (
    <div className="absolute bottom-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        ref={containerRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          maxWidth: isExpanded ? "48rem" : "320px",
          width: "100%",
        }}
        className="bg-background/80 backdrop-blur-md rounded-2xl border border-divider shadow-lg pointer-events-auto overflow-hidden transition-[max-width] duration-300 ease-out"
      >
        <div className="flex flex-col">
          {/* Previews Area - Unified pending images display */}
          <AnimatePresence>
            {isExpanded && pendingImages.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-4 overflow-hidden"
              >
                <div className="flex gap-2 flex-wrap mb-2">
                  {/* Display count indicator if multiple images */}
                  {pendingImages.length > 1 && (
                    <div className="text-xs text-default-500 w-full mb-1">
                      {t("chat.pendingImagesCount", {
                        count: pendingImages.length,
                        max: MAX_PENDING_IMAGES,
                      })}
                    </div>
                  )}

                  {/* Render each pending image */}
                  {pendingImages.map((img) => (
                    <div key={img.imageId} className="relative w-fit group">
                      <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative">
                        {/* Image with loading overlay if uploading */}
                        <img
                          src={
                            img.isUploading && img.localPreviewUrl
                              ? img.localPreviewUrl
                              : img.url
                          }
                          alt={img.title || t("chat.image")}
                          className={clsx(
                            "w-full h-full object-cover",
                            img.isUploading && "opacity-50"
                          )}
                        />

                        {/* Uploading spinner overlay */}
                        {img.isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Spinner size="sm" color="white" />
                          </div>
                        )}

                        {/* Source indicator and title overlay */}
                        {!img.isUploading && (
                          <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent flex flex-col justify-end p-1">
                            <div className="flex items-center gap-1 text-white/80">
                              {getSourceIcon(img.source)}
                              <span className="text-[8px] uppercase tracking-wide">
                                {getSourceLabel(img.source)}
                              </span>
                            </div>
                            {img.title && (
                              <span className="text-white text-[10px] leading-tight font-medium line-clamp-2">
                                {img.title}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => onRemovePendingImage(img.imageId)}
                        disabled={img.isUploading}
                        className={clsx(
                          "absolute -top-2 -right-2 bg-default-100 rounded-full p-1 shadow-sm border border-divider",
                          img.isUploading
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-default-200"
                        )}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  {/* Precision editing toggle */}
                  <div className="flex items-center h-20 ml-2 gap-1">
                    <Switch
                      size="sm"
                      color="secondary"
                      isSelected={precisionEditing}
                      onValueChange={onPrecisionEditingChange}
                    >
                      <span className="text-xs font-medium">
                        {t("chat.precisionEditing")}
                      </span>
                    </Switch>
                    <Tooltip content={t("chat.precisionEditingDesc")}>
                      <Info
                        size={14}
                        className="text-default-400 cursor-help"
                      />
                    </Tooltip>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Row */}
          <div className={clsx("flex items-center p-2", isExpanded && "gap-2")}>
            <div
              className={clsx(
                "flex gap-1 items-center overflow-hidden transition-all duration-300 shrink-0",
                isExpanded ? "w-auto opacity-100" : "w-0 opacity-0"
              )}
            >
              {showFileUpload && (
                <Button
                  isIconOnly
                  variant="flat"
                  onPress={onOpenAssetPicker}
                  aria-label={t("chat.addImage")}
                >
                  <ImagePlus size={24} className="text-default-500" />
                </Button>
              )}

              <Popover
                isOpen={
                  isRecording &&
                  siteConfig.audioRecording.maxDuration - recordingTime <=
                    siteConfig.audioRecording.countdownThreshold
                }
                placement="top"
              >
                <PopoverTrigger>
                  <div className="inline-block">
                    <Button
                      isIconOnly
                      variant={isRecording ? "solid" : "flat"}
                      color={isRecording ? "danger" : "default"}
                      onPress={isRecording ? onStopRecording : onStartRecording}
                      aria-label={t("chat.recordVoice")}
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
                      {t("chat.timeRemaining", {
                        seconds: Math.max(
                          0,
                          siteConfig.audioRecording.maxDuration - recordingTime
                        ),
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <Textarea
              placeholder={t("chat.typeMessage")}
              minRows={1}
              maxRows={isExpanded ? 5 : 1}
              value={input}
              onValueChange={onInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              className="flex-1 min-w-0"
              classNames={{
                input: "text-base",
                inputWrapper:
                  "bg-transparent shadow-none hover:bg-transparent focus-within:bg-transparent",
              }}
              isDisabled={isRecording}
            />

            <Tooltip
              content={hasUploadingImages ? t("chat.waitForUpload") : ""}
              isDisabled={!hasUploadingImages}
            >
              <Button
                isIconOnly
                color="primary"
                aria-label={t("chat.send")}
                onPress={onSend}
                isLoading={isSending}
                isDisabled={isRecording || isTranscribing || hasUploadingImages}
                className="shrink-0"
              >
                <Send size={20} />
              </Button>
            </Tooltip>
          </div>

          {/* Menu Configuration (Bottom) */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-2 pb-2">
                  <MenuConfiguration
                    state={menuState}
                    onStateChange={onMenuStateChange}
                    hasSelectedImages={pendingImages.length > 0}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
