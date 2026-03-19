"use client";

import React from "react";
import { Button } from "@heroui/button";
import {
  ImagePlus,
  Clapperboard,
  Gamepad2,
  Package,
  Layout,
  Film,
  GraduationCap,
  Search,
  Wand2,
  RefreshCw,
  Palette,
  Sparkles,
  Layers,
  Pencil,
  Zap,
  Eye,
  ArrowRight,
  Video,
  Type,
  Lightbulb,
  Brush,
  Megaphone,
  Music,
} from "lucide-react";
import type {
  SuggestionBubble,
  SuggestionBubbleAction,
} from "./suggestion-bubble-types";
import { dispatchSuggestionBubble } from "./suggestion-bubble-types";

const ICON_MAP: Record<string, React.ElementType> = {
  ImagePlus,
  Clapperboard,
  Gamepad2,
  Package,
  Layout,
  Film,
  GraduationCap,
  Search,
  Wand2,
  RefreshCw,
  Palette,
  Sparkles,
  Layers,
  Pencil,
  Zap,
  Eye,
  ArrowRight,
  Video,
  Type,
  Lightbulb,
  Brush,
  Megaphone,
  Music,
};

interface SuggestionBubbleGroupProps {
  suggestions: SuggestionBubble[];
  /** Direct callback — used when rendered inside chat-interface */
  onActivate?: (action: SuggestionBubbleAction) => void;
  /** If true, dispatch via window event instead of onActivate */
  useEvent?: boolean;
  className?: string;
}

export default function SuggestionBubbleGroup({
  suggestions,
  onActivate,
  useEvent = false,
  className,
}: SuggestionBubbleGroupProps) {
  const handleClick = (action: SuggestionBubbleAction) => {
    if (useEvent) {
      dispatchSuggestionBubble(action);
    } else if (onActivate) {
      onActivate(action);
    }
  };

  return (
    <div className={`flex flex-wrap justify-center gap-2 ${className ?? ""}`}>
      {suggestions.map((bubble) => {
        const Icon = bubble.icon ? ICON_MAP[bubble.icon] : null;
        return (
          <Button
            key={bubble.id}
            variant="bordered"
            size="sm"
            className="border-default-300 dark:border-default-500 text-default-600 dark:text-default-400 hover:bg-default-100 dark:hover:bg-white/10"
            startContent={Icon ? <Icon size={14} /> : undefined}
            onPress={() => handleClick(bubble.action)}
          >
            {bubble.label}
          </Button>
        );
      })}
    </div>
  );
}
