"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Plus, X } from "lucide-react";
import { TAG_COLORS, getTagColor } from "@/lib/tag-colors";

export interface TagValue {
  label: string;
  color: string;
}

interface TagInputProps {
  tags: TagValue[];
  onChange: (tags: TagValue[]) => void;
  maxTags?: number;
}

export default function TagInput({ tags, onChange, maxTags = 10 }: TagInputProps) {
  const t = useTranslations("collections");
  const [newLabel, setNewLabel] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[5].key); // default blue
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (!newLabel.trim() || tags.length >= maxTags) return;
    onChange([...tags, { label: newLabel.trim().substring(0, 50), color: selectedColor }]);
    setNewLabel("");
    setSelectedColor(TAG_COLORS[5].key);
    setIsAdding(false);
  };

  const handleRemove = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-foreground">
        {t("tags")}
      </label>

      {/* Existing tags */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, i) => {
          const color = getTagColor(tag.color);
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text}`}
            >
              {tag.label}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="hover:opacity-70 ml-0.5"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}

        {tags.length < maxTags && !isAdding && (
          <Button
            size="sm"
            variant="flat"
            startContent={<Plus size={14} />}
            onPress={() => setIsAdding(true)}
            className="h-6 text-xs"
          >
            {t("addTag")}
          </Button>
        )}
      </div>

      {/* Add tag inline form */}
      {isAdding && (
        <div className="flex items-end gap-2">
          <Input
            size="sm"
            placeholder={t("tagPlaceholder")}
            value={newLabel}
            onValueChange={setNewLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
              if (e.key === "Escape") {
                setIsAdding(false);
                setNewLabel("");
              }
            }}
            autoFocus
            className="flex-1"
          />
          <Popover placement="bottom">
            <PopoverTrigger>
              <button
                type="button"
                className="w-7 h-7 rounded-full border-2 border-default-300 flex-shrink-0"
                style={{ backgroundColor: getTagColor(selectedColor).dot }}
              />
            </PopoverTrigger>
            <PopoverContent>
              <div className="grid grid-cols-5 gap-1.5 p-2">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setSelectedColor(c.key)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      selectedColor === c.key
                        ? "ring-2 ring-offset-2 ring-primary scale-110"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c.dot }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" color="primary" onPress={handleAdd} isDisabled={!newLabel.trim()}>
            {t("add")}
          </Button>
          <Button
            size="sm"
            variant="light"
            onPress={() => {
              setIsAdding(false);
              setNewLabel("");
            }}
          >
            <X size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
