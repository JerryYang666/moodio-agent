"use client";

import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { downloadImage, ImageDownloadFormat } from "./utils";
import { useResearchTelemetry } from "@/hooks/use-research-telemetry";

interface ImageDownloadDropdownProps {
  imageId: string | undefined;
  title: string;
  url?: string;
  /** Icon size for the download icon */
  iconSize?: number;
  /** Additional className for the trigger button */
  className?: string;
  /** Chat ID for research telemetry context */
  chatId?: string;
  /** Download source context for research telemetry */
  downloadSource?: "chat" | "collection" | "detail_view";
}

const FORMAT_OPTIONS: { key: ImageDownloadFormat; label: string }[] = [
  { key: "png", label: "PNG" },
  { key: "jpeg", label: "JPEG" },
  { key: "webp", label: "WebP" },
];

export default function ImageDownloadDropdown({
  imageId,
  title,
  url,
  iconSize = 20,
  className = "bg-black/50 text-white",
  chatId,
  downloadSource = "detail_view",
}: ImageDownloadDropdownProps) {
  const t = useTranslations("imageDetail");
  const { track } = useResearchTelemetry();

  const handleDownload = (format: ImageDownloadFormat) => {
    downloadImage(imageId, title, url, format);
    if (imageId) {
      track({
        chatId,
        eventType: "image_downloaded",
        imageId,
        metadata: { source: downloadSource },
      });
    }
  };

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button isIconOnly variant="flat" className={className}>
          <Download size={iconSize} />
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t("downloadFormat")}
        onAction={(key) => handleDownload(key as ImageDownloadFormat)}
      >
        {FORMAT_OPTIONS.map((option) => (
          <DropdownItem key={option.key}>{option.label}</DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}
