"use client";

import { Select, SelectItem } from "@heroui/select";
import { useTranslations } from "next-intl";

import {
  CROP_ASPECT_RATIO_OPTIONS,
  type CropAspectChoice,
} from "@/lib/image/edit-pipeline";

interface CropAspectRatioSelectorProps {
  value: CropAspectChoice;
  onChange: (v: CropAspectChoice) => void;
  disabled?: boolean;
  className?: string;
}

const OPTION_KEYS: readonly CropAspectChoice[] = [
  "free",
  "source",
  ...CROP_ASPECT_RATIO_OPTIONS,
];

/**
 * Aspect-ratio dropdown for the crop tool. Mirrors AspectRatioSelector
 * (AI flows) but includes a "Free" option that maps to no constraint, so
 * users can drag the crop handles independently.
 */
export default function CropAspectRatioSelector({
  value,
  onChange,
  disabled,
  className,
}: CropAspectRatioSelectorProps) {
  const t = useTranslations("desktop.imageEdit.aspectRatio");

  return (
    <Select
      label={t("label")}
      selectedKeys={[value]}
      onChange={(e) => {
        const next = e.target.value as CropAspectChoice;
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
          {key === "free"
            ? t("free")
            : key === "source"
            ? t("matchSource")
            : key}
        </SelectItem>
      ))}
    </Select>
  );
}
