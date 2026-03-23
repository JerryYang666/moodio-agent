"use client";

import { useCallback } from "react";
import { Button } from "@heroui/button";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Plus, Trash2, ChevronDown, Film } from "lucide-react";
import type { MultiPromptShot } from "@/lib/video/models";

const DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const MAX_SHOTS = 5;
const MAX_PROMPT_LENGTH = 500;

interface MultiShotEditorProps {
  shots: MultiPromptShot[];
  onChange: (shots: MultiPromptShot[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function MultiShotEditor({
  shots,
  onChange,
  disabled = false,
  compact = false,
}: MultiShotEditorProps) {
  const addShot = useCallback(() => {
    if (shots.length >= MAX_SHOTS) return;
    onChange([...shots, { prompt: "", duration: 3 }]);
  }, [shots, onChange]);

  const removeShot = useCallback(
    (index: number) => {
      onChange(shots.filter((_, i) => i !== index));
    },
    [shots, onChange]
  );

  const updateShot = useCallback(
    (index: number, updates: Partial<MultiPromptShot>) => {
      onChange(
        shots.map((shot, i) => (i === index ? { ...shot, ...updates } : shot))
      );
    },
    [shots, onChange]
  );

  const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-default-500">
          <Film size={14} />
          <span className="font-medium">
            Multi-Shot ({shots.length}/{MAX_SHOTS})
          </span>
          {shots.length > 0 && (
            <span className="text-default-400">
              &middot; {totalDuration}s total
            </span>
          )}
        </div>
        {!disabled && shots.length < MAX_SHOTS && (
          <Button
            size="sm"
            variant="flat"
            startContent={<Plus size={14} />}
            onPress={addShot}
            className="h-6 min-w-0 px-2 text-xs"
          >
            Add Shot
          </Button>
        )}
      </div>

      {shots.length === 0 && !disabled && (
        <button
          onClick={addShot}
          className="w-full rounded-lg border-2 border-dashed border-default-200 p-3 text-xs text-default-400 hover:border-default-300 hover:text-default-500 transition-colors"
        >
          Click to add your first shot
        </button>
      )}

      <div className="space-y-2">
        {shots.map((shot, index) => (
          <div
            key={index}
            className="rounded-lg border border-divider bg-background/50 p-2.5"
          >
            <div className="flex items-start gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-default-100 text-[10px] font-bold text-default-500 shrink-0 mt-0.5">
                {index + 1}
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <textarea
                  value={shot.prompt}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.length <= MAX_PROMPT_LENGTH) {
                      updateShot(index, { prompt: val });
                    }
                  }}
                  placeholder={`Shot ${index + 1} prompt...`}
                  disabled={disabled}
                  rows={compact ? 1 : 2}
                  className="w-full bg-transparent text-xs resize-none outline-none placeholder:text-default-300"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Dropdown>
                      <DropdownTrigger>
                        <button
                          disabled={disabled}
                          className="flex items-center gap-1 text-[11px] text-default-500 bg-default-100 rounded-md px-1.5 py-0.5 hover:bg-default-200 transition-colors"
                        >
                          {shot.duration}s
                          <ChevronDown size={10} />
                        </button>
                      </DropdownTrigger>
                      <DropdownMenu
                        disallowEmptySelection
                        aria-label="Shot duration"
                        selectedKeys={new Set([String(shot.duration)])}
                        selectionMode="single"
                        variant="flat"
                        onSelectionChange={(keys) => {
                          const val = Array.from(keys)[0];
                          if (val) updateShot(index, { duration: Number(val) });
                        }}
                      >
                        {DURATION_OPTIONS.map((d) => (
                          <DropdownItem key={String(d)} textValue={`${d}s`}>{d}s</DropdownItem>
                        ))}
                      </DropdownMenu>
                    </Dropdown>

                    <span className="text-[10px] text-default-400">
                      {shot.prompt.length}/{MAX_PROMPT_LENGTH}
                    </span>
                  </div>

                  {!disabled && (
                    <button
                      onClick={() => removeShot(index)}
                      className="p-0.5 text-default-400 hover:text-danger transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
