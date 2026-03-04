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

interface ImageDownloadDropdownProps {
  imageId: string | undefined;
  title: string;
  url?: string;
  /** Icon size for the download icon */
  iconSize?: number;
  /** Additional className for the trigger button */
  className?: string;
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
}: ImageDownloadDropdownProps) {
  const t = useTranslations("imageDetail");

  const handleDownload = (format: ImageDownloadFormat) => {
    downloadImage(imageId, title, url, format);
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
