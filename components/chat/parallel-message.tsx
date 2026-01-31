"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import clsx from "clsx";
import { Message } from "@/lib/llm/types";
import ChatMessage from "./chat-message";

interface ParallelMessageProps {
  variants: Message[];
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
  onForkChat?: (messageIndex: number) => void;
  /** Force compact/mobile view regardless of viewport width */
  compactMode?: boolean;
  /** Hide avatars for both user and assistant messages */
  hideAvatars?: boolean;
}

export default function ParallelMessage({
  variants,
  messageIndex,
  chatId,
  user,
  selectedImageIds,
  onAgentImageSelect,
  onAgentTitleClick,
  onForkChat,
  compactMode = false,
  hideAvatars = false,
}: ParallelMessageProps) {
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; time: number } | null>(null);

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      time: Date.now(),
    };
    setIsSwiping(true);
  }, []);

  // Handle touch move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    setSwipeOffset(deltaX);
  }, []);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;

    const threshold = 50; // Minimum distance to trigger swipe

    if (swipeOffset > threshold && currentVariantIndex > 0) {
      // Swipe right - go to previous
      setCurrentVariantIndex(currentVariantIndex - 1);
    } else if (
      swipeOffset < -threshold &&
      currentVariantIndex < variants.length - 1
    ) {
      // Swipe left - go to next
      setCurrentVariantIndex(currentVariantIndex + 1);
    }

    touchStartRef.current = null;
    setIsSwiping(false);
    setSwipeOffset(0);
  }, [swipeOffset, currentVariantIndex, variants.length]);

  // Navigate to previous variant
  const goToPrevious = useCallback(() => {
    if (currentVariantIndex > 0) {
      setCurrentVariantIndex(currentVariantIndex - 1);
    }
  }, [currentVariantIndex]);

  // Navigate to next variant
  const goToNext = useCallback(() => {
    if (currentVariantIndex < variants.length - 1) {
      setCurrentVariantIndex(currentVariantIndex + 1);
    }
  }, [currentVariantIndex, variants.length]);

  // Wrap agent image select to include variantId
  const handleAgentImageSelect = useCallback(
    (part: any, msgIndex: number, partIndex: number) => {
      const variantId = variants[currentVariantIndex]?.variantId;
      onAgentImageSelect(part, msgIndex, partIndex, variantId);
    },
    [onAgentImageSelect, variants, currentVariantIndex]
  );

  // If only one variant, render normally
  if (variants.length === 1) {
    return (
      <ChatMessage
        message={variants[0]}
        messageIndex={messageIndex}
        chatId={chatId}
        user={user}
        selectedImageIds={selectedImageIds}
        onAgentImageSelect={onAgentImageSelect}
        onAgentTitleClick={onAgentTitleClick}
        onForkChat={onForkChat}
        hideAvatar={hideAvatars}
      />
    );
  }

  // Use compact mode when prop is set, otherwise use responsive classes
  const showCompactView = compactMode;

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Desktop: Side by side (hidden in compact mode) */}
      {!showCompactView && (
        <div className="hidden lg:grid lg:grid-cols-2 gap-2">
          {variants.map((variant, idx) => (
            <div key={variant.variantId || idx} className="relative">
              {/* Variant label */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                <span className="px-2 py-0.5 text-xs bg-default-100 text-default-500 rounded-full">
                  Option {idx + 1}
                </span>
              </div>
              <ChatMessage
                message={variant}
                messageIndex={messageIndex}
                chatId={chatId}
                user={user}
                selectedImageIds={selectedImageIds}
                onAgentImageSelect={(part, msgIdx, partIdx) =>
                  onAgentImageSelect(part, msgIdx, partIdx, variant.variantId)
                }
                onAgentTitleClick={onAgentTitleClick}
                onForkChat={onForkChat}
                hideAvatar={idx > 0 || hideAvatars}
              />
            </div>
          ))}
        </div>
      )}

      {/* Mobile/Compact: Swipeable carousel */}
      <div className={showCompactView ? "block" : "lg:hidden"}>
        {/* Navigation dots */}
        <div className="flex justify-center items-center gap-2 mb-3">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={goToPrevious}
            isDisabled={currentVariantIndex === 0}
            className="min-w-8 w-8 h-8"
          >
            <ChevronLeft size={16} />
          </Button>

          <div className="flex gap-1.5">
            {variants.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentVariantIndex(idx)}
                className={clsx(
                  "w-2 h-2 rounded-full transition-all duration-200",
                  idx === currentVariantIndex
                    ? "bg-primary w-6"
                    : "bg-default-300 hover:bg-default-400"
                )}
                aria-label={`Go to option ${idx + 1}`}
              />
            ))}
          </div>

          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={goToNext}
            isDisabled={currentVariantIndex === variants.length - 1}
            className="min-w-8 w-8 h-8"
          >
            <ChevronRight size={16} />
          </Button>
        </div>

        {/* Variant label */}
        <div className="text-center mb-2">
          <span className="px-3 py-1 text-xs bg-default-100 text-default-500 rounded-full">
            Option {currentVariantIndex + 1} of {variants.length}
          </span>
        </div>

        {/* Swipeable container */}
        <div
          ref={containerRef}
          className="overflow-hidden touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="transition-transform duration-300 ease-out"
            style={{
              transform: isSwiping
                ? `translateX(${swipeOffset}px)`
                : `translateX(0)`,
            }}
          >
            <ChatMessage
              message={variants[currentVariantIndex]}
              messageIndex={messageIndex}
              chatId={chatId}
              user={user}
              selectedImageIds={selectedImageIds}
              onAgentImageSelect={handleAgentImageSelect}
              onAgentTitleClick={onAgentTitleClick}
              onForkChat={onForkChat}
              hideAvatar={hideAvatars}
            />
          </div>
        </div>

        {/* Swipe hint */}
        <div className="text-center mt-3 text-xs text-default-400">
          <span className="inline-flex items-center gap-1">
            <Layers size={12} />
            Swipe to see other options
          </span>
        </div>
      </div>
    </div>
  );
}
