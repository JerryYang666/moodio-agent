"use client";

import { useRef, useState, useEffect } from "react";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Switch } from "@heroui/switch";
import { Tooltip } from "@heroui/tooltip";
import { siteConfig } from "@/config/site";
import { Send, X, ImagePlus, Mic, Square, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MenuConfiguration, { MenuState } from "./menu-configuration";
import clsx from "clsx";

interface SelectedAgentPart {
  url: string;
  title: string;
  messageIndex: number;
  partIndex: number;
  imageId?: string;
}

interface SelectedAsset {
  assetId: string;
  url: string;
  title: string;
  imageId: string;
}

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
  previewUrl: string | null;
  onClearFile: () => void;
  selectedAgentPart: SelectedAgentPart | null;
  onClearSelectedAgentPart: () => void;
  selectedAsset: SelectedAsset | null;
  onClearSelectedAsset: () => void;
  onOpenAssetPicker: () => void;
  onAssetDrop: (payload: SelectedAsset | { assetId: string }) => void;
  showFileUpload: boolean;
  precisionEditing: boolean;
  onPrecisionEditingChange: (value: boolean) => void;
  menuState: MenuState;
  onMenuStateChange: (newState: MenuState) => void;
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
  previewUrl,
  onClearFile,
  selectedAgentPart,
  onClearSelectedAgentPart,
  selectedAsset,
  onClearSelectedAsset,
  onOpenAssetPicker,
  onAssetDrop,
  showFileUpload,
  precisionEditing,
  onPrecisionEditingChange,
  menuState,
  onMenuStateChange,
}: ChatInputProps) {
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
    if (previewUrl || selectedAgentPart || selectedAsset || isRecording) {
      setIsExpanded(true);
    }
  }, [previewUrl, selectedAgentPart, selectedAsset, isRecording]);

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
          {/* Previews Area */}
          <AnimatePresence>
            {isExpanded && (previewUrl || selectedAgentPart || selectedAsset) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-4 overflow-hidden"
              >
                <div className="flex gap-2 flex-wrap mb-2">
                  {previewUrl && (
                    <div className="relative w-fit">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="h-20 rounded-lg border border-divider"
                      />
                      <button
                        onClick={onClearFile}
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
                        onClick={onClearSelectedAgentPart}
                        className="absolute -top-2 -right-2 bg-default-100 rounded-full p-1 hover:bg-default-200 shadow-sm border border-divider"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {selectedAsset && (
                    <div className="relative w-fit group">
                      <div className="h-20 w-20 rounded-lg border border-divider overflow-hidden relative">
                        <img
                          src={selectedAsset.url}
                          alt={selectedAsset.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-1">
                          <span className="text-white text-[10px] text-center leading-tight font-medium line-clamp-3">
                            Asset: {selectedAsset.title}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={onClearSelectedAsset}
                        className="absolute -top-2 -right-2 bg-default-100 rounded-full p-1 hover:bg-default-200 shadow-sm border border-divider"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {(previewUrl || selectedAgentPart || selectedAsset) && (
                    <div className="flex items-center h-20 ml-2 gap-1">
                      <Switch
                        size="sm"
                        color="secondary"
                        isSelected={precisionEditing}
                        onValueChange={onPrecisionEditingChange}
                      >
                        <span className="text-xs font-medium">
                          Precision Editing
                        </span>
                      </Switch>
                      <Tooltip content="When enabled, Agent will try its best to only edit the part of the image that you want to change and keeping everything else the same.">
                        <Info
                          size={14}
                          className="text-default-400 cursor-help"
                        />
                      </Tooltip>
                    </div>
                  )}
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
                  aria-label="Add image"
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
                      {Math.max(
                        0,
                        siteConfig.audioRecording.maxDuration - recordingTime
                      )}
                      s remaining
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <Textarea
              placeholder="Type a message..."
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

            <Button
              isIconOnly
              color="primary"
              aria-label="Send"
              onPress={onSend}
              isLoading={isSending}
              isDisabled={isRecording || isTranscribing}
              className="shrink-0"
            >
              <Send size={20} />
            </Button>
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
                    hasSelectedImages={!!(previewUrl || selectedAgentPart)}
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
