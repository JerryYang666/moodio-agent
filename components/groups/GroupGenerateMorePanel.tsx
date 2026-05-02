"use client";

import { useState, useEffect } from "react";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Sparkles } from "lucide-react";

interface GroupGenerateMorePanelProps {
  modality: "image" | "video";
  /** Effective config (defaultGenerationConfig overlaid with copied member). */
  config: Record<string, unknown>;
  /** Optional list of members to populate the "copy config from…" dropdown. */
  members?: Array<{ id: string; label: string }>;
  /** Active member whose config is currently in the form (for the dropdown). */
  copiedFromMemberId?: string | null;
  onCopiedFromChange?: (memberId: string | null) => void;
  onSubmit: (config: Record<string, unknown>) => Promise<void> | void;
  isSubmitting?: boolean;
  disabled?: boolean;
}

export default function GroupGenerateMorePanel({
  modality,
  config,
  members,
  copiedFromMemberId,
  onCopiedFromChange,
  onSubmit,
  isSubmitting,
  disabled,
}: GroupGenerateMorePanelProps) {
  const [prompt, setPrompt] = useState<string>(
    typeof config.prompt === "string" ? config.prompt : ""
  );

  // Re-seed prompt when caller swaps in a new config (e.g. via copy-from-member).
  useEffect(() => {
    if (typeof config.prompt === "string") {
      setPrompt(config.prompt);
    }
  }, [config]);

  const submit = async () => {
    if (!prompt.trim()) return;
    await onSubmit({ ...config, prompt: prompt.trim() });
  };

  return (
    <div className="border-t border-divider pt-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-default-600 uppercase">
          {modality === "image" ? "Generate another image" : "Generate another video"}
        </span>
        {members && members.length > 0 && onCopiedFromChange && (
          <Select
            size="sm"
            className="max-w-[180px]"
            placeholder="Copy config from…"
            selectedKeys={copiedFromMemberId ? [copiedFromMemberId] : []}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0];
              onCopiedFromChange(k ?? null);
            }}
            aria-label="Copy config from member"
          >
            {members.map((m) => (
              <SelectItem key={m.id}>{m.label}</SelectItem>
            ))}
          </Select>
        )}
      </div>

      <Textarea
        size="sm"
        minRows={2}
        maxRows={5}
        placeholder="Prompt"
        value={prompt}
        onValueChange={setPrompt}
        isDisabled={disabled || isSubmitting}
      />

      <div className="flex justify-end">
        <Button
          color="primary"
          size="sm"
          startContent={<Sparkles size={14} />}
          isLoading={isSubmitting}
          isDisabled={disabled || !prompt.trim()}
          onPress={submit}
        >
          {modality === "image" ? "Generate image" : "Generate video"}
        </Button>
      </div>
    </div>
  );
}
