"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Tooltip } from "@heroui/tooltip";
import { Textarea } from "@heroui/input";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";
import { Badge } from "@heroui/badge";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { Pin, X, Plus, ChevronDown, ImagePlus, Type, BookImage, FileUp } from "lucide-react";
import {
  PersistentAssets,
  PersistentReferenceImage,
  MAX_TEXT_CHUNK_LENGTH,
  MAX_PERSISTENT_REFERENCE_IMAGES,
  EMPTY_PERSISTENT_ASSETS,
} from "@/lib/chat/persistent-assets-types";
import {
  ReferenceImageTag,
  REFERENCE_IMAGE_TAGS,
} from "@/components/chat/reference-image-types";
import {
  useUpdatePersistentAssetsMutation,
} from "@/lib/redux/services/next-api";

interface PersistentAssetsPanelProps {
  chatId: string;
  persistentAssets: PersistentAssets & {
    referenceImages: Array<PersistentReferenceImage & { imageUrl?: string }>;
  };
  onOpenAssetPicker: () => void;
  isSavingExternal?: boolean;
}

const TAG_LABELS: Record<ReferenceImageTag, string> = {
  none: "tagNone",
  subject: "tagSubject",
  scene: "tagScene",
  item: "tagItem",
  style: "tagStyle",
};

export function PersistentAssetsPanel({
  chatId,
  persistentAssets,
  onOpenAssetPicker,
  isSavingExternal,
}: PersistentAssetsPanelProps) {
  const t = useTranslations("chat");
  const [isOpen, setIsOpen] = useState(false);
  const [localAssets, setLocalAssets] = useState<PersistentAssets>(persistentAssets);
  const [updateAssets, { isLoading: isSaving }] = useUpdatePersistentAssetsMutation();
  const [isParsing, setIsParsing] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when server data changes
  useEffect(() => {
    setLocalAssets(persistentAssets);
  }, [persistentAssets]);

  const assetCount =
    localAssets.referenceImages.length + (localAssets.textChunk.length > 0 ? 1 : 0);

  const save = useCallback(
    async (assets: PersistentAssets) => {
      try {
        await updateAssets({
          chatId,
          referenceImages: assets.referenceImages,
          textChunk: assets.textChunk,
        }).unwrap();
        addToast({
          title: t("persistentAssetsSaved"),
          color: "success",
          timeout: 2000,
        });
      } catch {
        addToast({
          title: t("persistentAssetsSaveError"),
          color: "danger",
          timeout: 3000,
        });
      }
    },
    [chatId, updateAssets, t]
  );

  const handleRemoveImage = useCallback(
    (imageId: string) => {
      const updated = {
        ...localAssets,
        referenceImages: localAssets.referenceImages.filter(
          (img) => img.imageId !== imageId
        ),
      };
      setLocalAssets(updated);
      save(updated);
    },
    [localAssets, save]
  );

  const handleUpdateTag = useCallback(
    (imageId: string, tag: ReferenceImageTag) => {
      const updated = {
        ...localAssets,
        referenceImages: localAssets.referenceImages.map((img) =>
          img.imageId === imageId ? { ...img, tag } : img
        ),
      };
      setLocalAssets(updated);
      save(updated);
    },
    [localAssets, save]
  );

  const handleTextChunkChange = useCallback(
    (value: string) => {
      const truncated = value.slice(0, MAX_TEXT_CHUNK_LENGTH);
      setLocalAssets((prev) => ({ ...prev, textChunk: truncated }));
    },
    []
  );

  const handleTextChunkBlur = useCallback(() => {
    if (localAssets.textChunk !== persistentAssets.textChunk) {
      save(localAssets);
    }
  }, [localAssets, persistentAssets.textChunk, save]);

  // Called from parent after asset picker selects images
  const addReferenceImage = useCallback(
    (image: PersistentReferenceImage & { imageUrl?: string }) => {
      if (localAssets.referenceImages.length >= MAX_PERSISTENT_REFERENCE_IMAGES) return;
      if (localAssets.referenceImages.some((img) => img.imageId === image.imageId)) return;
      const updated = {
        ...localAssets,
        referenceImages: [...localAssets.referenceImages, image],
      };
      setLocalAssets(updated);
      save(updated);
    },
    [localAssets, save]
  );

  const handleDocumentUpload = useCallback(
    async (file: File) => {
      const MAX_DOC_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_DOC_SIZE) {
        addToast({ title: t("uploadDocumentTooLarge"), color: "danger", timeout: 3000 });
        return;
      }
      const validTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!validTypes.includes(file.type)) {
        addToast({ title: t("uploadDocumentInvalidType"), color: "danger", timeout: 3000 });
        return;
      }

      setIsParsing(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse-document", { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.error === "FILE_TOO_LARGE") {
            addToast({ title: t("uploadDocumentTooLarge"), color: "danger", timeout: 3000 });
          } else if (data.error === "INVALID_TYPE") {
            addToast({ title: t("uploadDocumentInvalidType"), color: "danger", timeout: 3000 });
          } else {
            addToast({ title: t("uploadDocumentFailed"), color: "danger", timeout: 3000 });
          }
          return;
        }
        const { text } = await res.json();
        if (!text || text.trim().length === 0) {
          addToast({ title: t("uploadDocumentFailed"), color: "danger", timeout: 3000 });
          return;
        }

        const current = localAssets.textChunk;
        const combined = current ? `${current}\n\n${text}` : text;
        const truncated = combined.slice(0, MAX_TEXT_CHUNK_LENGTH);
        const wasTruncated = combined.length > MAX_TEXT_CHUNK_LENGTH;

        const updated = { ...localAssets, textChunk: truncated };
        setLocalAssets(updated);
        await save(updated);

        if (wasTruncated) {
          addToast({ title: t("uploadDocumentTruncated"), color: "warning", timeout: 4000 });
        } else {
          addToast({ title: t("uploadDocumentSuccess"), color: "success", timeout: 2000 });
        }
      } catch {
        addToast({ title: t("uploadDocumentFailed"), color: "danger", timeout: 3000 });
      } finally {
        setIsParsing(false);
        if (docInputRef.current) docInputRef.current.value = "";
      }
    },
    [localAssets, save, t]
  );

  return (
    <Tooltip content={t("persistentAssets")} isDisabled={isOpen} delay={400}>
      <div>
        <Popover
          placement="bottom-start"
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          offset={8}
        >
          <PopoverTrigger>
            <Button
              isIconOnly
              variant="light"
              size="sm"
              aria-label={t("persistentAssets")}
              isLoading={!isOpen && isSavingExternal}
            >
              <Badge
                content={assetCount}
                color="primary"
                size="sm"
                isInvisible={assetCount === 0}
                placement="top-right"
              >
                <BookImage size={18} />
              </Badge>
            </Button>
          </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("persistentAssets")}</h3>
            {isSaving && <Spinner size="sm" />}
          </div>
          <p className="text-xs text-default-400">{t("persistentAssetsInfo")}</p>

          {/* Reference Images Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ImagePlus size={14} className="text-default-500" />
                <span className="text-xs font-medium text-default-600">
                  {t("referenceImages")}
                </span>
                <span className="text-xs text-default-400">
                  {localAssets.referenceImages.length}/{MAX_PERSISTENT_REFERENCE_IMAGES}
                </span>
              </div>
              {localAssets.referenceImages.length < MAX_PERSISTENT_REFERENCE_IMAGES && (
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Plus size={14} />}
                  className="h-7 text-xs"
                  onPress={() => {
                    setIsOpen(false);
                    onOpenAssetPicker();
                  }}
                >
                  {t("addReferenceImage")}
                </Button>
              )}
            </div>

            {localAssets.referenceImages.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {(localAssets.referenceImages as Array<PersistentReferenceImage & { imageUrl?: string }>).map((img) => (
                  <div
                    key={img.imageId}
                    className="relative group rounded-lg overflow-hidden border border-divider bg-default-50"
                  >
                    <div className="aspect-square relative">
                      {img.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.imageUrl}
                          alt={img.title || "Reference"}
                          className="w-full h-full object-cover"
                        />
                      )}
                      <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        className="absolute top-1 right-1 h-6 w-6 min-w-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white"
                        onPress={() => handleRemoveImage(img.imageId)}
                      >
                        <X size={12} />
                      </Button>
                      {img.title && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
                          <p className="text-[10px] text-white truncate">{img.title}</p>
                        </div>
                      )}
                    </div>
                    <div className="p-1">
                      <Dropdown>
                        <DropdownTrigger>
                          <Button
                            size="sm"
                            variant="flat"
                            className="w-full h-6 min-w-0 px-2 text-[10px]"
                          >
                            {t(TAG_LABELS[img.tag])}
                            <ChevronDown size={10} className="ml-auto" />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                          aria-label={t("selectTag")}
                          selectionMode="single"
                          selectedKeys={new Set([img.tag])}
                          onSelectionChange={(keys) => {
                            const selected = Array.from(keys)[0] as ReferenceImageTag;
                            if (selected) handleUpdateTag(img.imageId, selected);
                          }}
                        >
                          {REFERENCE_IMAGE_TAGS.map((tag) => (
                            <DropdownItem key={tag}>{t(TAG_LABELS[tag])}</DropdownItem>
                          ))}
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Text Chunk Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Type size={14} className="text-default-500" />
                <span className="text-xs font-medium text-default-600">
                  {t("persistentTextChunk")}
                </span>
              </div>
              <Tooltip content={t("uploadDocument")} delay={300}>
                <Button
                  size="sm"
                  variant="flat"
                  isIconOnly
                  className="h-7 w-7 min-w-0"
                  isLoading={isParsing}
                  onPress={() => docInputRef.current?.click()}
                  aria-label={t("uploadDocument")}
                >
                  <FileUp size={14} />
                </Button>
              </Tooltip>
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDocumentUpload(file);
                }}
              />
            </div>
            <Textarea
              value={localAssets.textChunk}
              onValueChange={handleTextChunkChange}
              onBlur={handleTextChunkBlur}
              placeholder={t("persistentTextChunkPlaceholder")}
              maxLength={MAX_TEXT_CHUNK_LENGTH}
              minRows={3}
              maxRows={8}
              size="sm"
              variant="bordered"
              classNames={{
                input: "text-xs",
              }}
            />
            <p className="text-[10px] text-default-400 text-right">
              {t("persistentTextChunkCount", {
                count: localAssets.textChunk.length,
                max: MAX_TEXT_CHUNK_LENGTH,
              })}
            </p>
          </div>
        </div>
      </PopoverContent>
        </Popover>
      </div>
    </Tooltip>
  );
}

// Export addReferenceImage for external use
export type { PersistentAssetsPanelProps };
