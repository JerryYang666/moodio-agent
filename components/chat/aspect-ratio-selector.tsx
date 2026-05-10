"use client";

import { Select, SelectItem } from "@heroui/select";
import { useTranslations } from "next-intl";

import {
  ASPECT_RATIO_OPTIONS,
  type AspectRatioChoice,
} from "@/lib/image/edit-pipeline";

interface AspectRatioSelectorProps {
  value: AspectRatioChoice;
  onChange: (v: AspectRatioChoice) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Options rendered into the dropdown. "source" is the default; the rest are
 * the curated subset of SUPPORTED_ASPECT_RATIOS exposed to the user.
 */
const OPTION_KEYS: readonly AspectRatioChoice[] = [
  "source",
  ...ASPECT_RATIO_OPTIONS,
];

/**
 * Compact aspect-ratio dropdown shared by the desktop in-canvas overlay and
 * the chat image-edit modal. Default "Match source" preserves the source
 * image's shape (snapped to the closest supported ratio on submit); the
 * remaining options pass through to the provider verbatim.
 */
export default function AspectRatioSelector({
  value,
  onChange,
  disabled,
  className,
}: AspectRatioSelectorProps) {
  const t = useTranslations("desktop.imageEdit.aspectRatio");

  return (
    <Select
      label={t("label")}
      selectedKeys={[value]}
      onChange={(e) => {
        const next = e.target.value as AspectRatioChoice;
        if (next) onChange(next);
      }}
      size="sm"
      variant="flat"
      isDisabled={disabled}
      className={className}
      disallowEmptySelection
    >
      {OPTION_KEYS.map((key) => (
        <SelectItem key={key}>
          {key === "source" ? t("matchSource") : key}
        </SelectItem>
      ))}
    </Select>
  );
}
