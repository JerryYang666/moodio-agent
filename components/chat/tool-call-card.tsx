"use client";

import { Spinner } from "@heroui/spinner";
import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";

interface ToolCallCardProps {
  tool: string;
  status: "loading" | "complete" | "error";
}

const TOOL_LABELS: Record<string, { loading: string; complete: string }> = {
  check_taxonomy: {
    loading: "chat.toolCall.checkingTaxonomy",
    complete: "chat.toolCall.taxonomyLoaded",
  },
};

export default function ToolCallCard({ tool, status }: ToolCallCardProps) {
  const t = useTranslations();
  const labels = TOOL_LABELS[tool];

  const label = labels
    ? t(status === "loading" ? labels.loading : labels.complete)
    : tool;

  return (
    <div className="flex items-center gap-2 text-xs text-default-500 py-1">
      {status === "loading" ? (
        <Spinner size="sm" classNames={{ wrapper: "w-3.5 h-3.5" }} />
      ) : status === "complete" ? (
        <Check size={14} className="text-success" />
      ) : (
        <Search size={14} className="text-danger" />
      )}
      <span>{label}</span>
    </div>
  );
}
