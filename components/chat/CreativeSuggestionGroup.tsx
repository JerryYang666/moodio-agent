"use client";

import React from "react";
import { ArrowDownRight, RefreshCw } from "lucide-react";
import type { CreativeSuggestion } from "@/config/creative-suggestions";

interface CreativeSuggestionGroupProps {
  suggestions: CreativeSuggestion[];
  onActivate: (suggestion: CreativeSuggestion) => void;
  onRefresh: () => void;
  className?: string;
}

export default function CreativeSuggestionGroup({
  suggestions,
  onActivate,
  onRefresh,
  className,
}: CreativeSuggestionGroupProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className={`flex flex-col items-start gap-1 ${className ?? ""}`}>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm text-default-500 hover:text-default-800 dark:hover:text-default-200 hover:bg-default-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          onClick={() => onActivate(suggestion)}
        >
          <span>{suggestion.title}</span>
          <ArrowDownRight size={14} className="shrink-0 opacity-40" />
        </button>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-default-400 hover:text-default-600 dark:hover:text-default-300 hover:bg-default-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
        onClick={onRefresh}
      >
        <RefreshCw size={12} />
        <span>More ideas</span>
      </button>
    </div>
  );
}
