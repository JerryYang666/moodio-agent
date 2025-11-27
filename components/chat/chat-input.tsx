"use client";

import { useRef } from "react";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Switch } from "@heroui/switch";
import { Tooltip } from "@heroui/tooltip";
import { siteConfig } from "@/config/site";
import { Send, X, ImagePlus, Mic, Square, Info } from "lucide-react";

interface SelectedAgentPart {
  url: string;
  title: string;
  messageIndex: number;
  partIndex: number;
  imageId?: string;
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
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  selectedAgentPart: SelectedAgentPart | null;
  onClearSelectedAgentPart: () => void;
  showFileUpload: boolean;
  precisionEditing: boolean;
  onPrecisionEditingChange: (value: boolean) => void;
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
  onFileSelect,
  onClearFile,
  selectedAgentPart,
  onClearSelectedAgentPart,
  showFileUpload,
  precisionEditing,
  onPrecisionEditingChange,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="sticky bottom-0 bg-background/80 backdrop-blur-md pt-3 pb-0 border-t border-divider z-10">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        {/* Previews */}
        <div className="flex gap-2 flex-wrap">
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
          
          {(previewUrl || selectedAgentPart) && (
            <div className="flex items-center h-20 ml-2 gap-1">
               <Switch
                size="sm"
                color="secondary"
                isSelected={precisionEditing}
                onValueChange={onPrecisionEditingChange}
              >
                <span className="text-xs font-medium">Precision Editing</span>
              </Switch>
              <Tooltip content="When enabled, Agent will try its best to only edit the part of the image that you want to change and keeping everything else the same.">
                <Info size={14} className="text-default-400 cursor-help" />
              </Tooltip>
            </div>
          )}
        </div>

        {/* Input row */}
        <div className="flex gap-2 items-start">
          {showFileUpload && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/png, image/jpeg, image/webp, image/gif"
                onChange={onFileSelect}
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
                  {Math.max(
                    0,
                    siteConfig.audioRecording.maxDuration - recordingTime
                  )}
                  s remaining
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Textarea
            placeholder="Type a message..."
            minRows={1}
            maxRows={5}
            value={input}
            onValueChange={onInputChange}
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
            onPress={onSend}
            isLoading={isSending}
            isDisabled={isRecording || isTranscribing}
            className="mb-[2px]"
          >
            <Send size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
}

