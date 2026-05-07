"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Plus, Trash2, Sparkles, ImagePlus, X, Library } from "lucide-react";
import { useTranslations } from "next-intl";
import type { KlingElement } from "@/lib/video/models";

const MAX_ELEMENTS = 3;
const MIN_IMAGES = 2;
const MAX_IMAGES = 4;

/**
 * Element schema variant:
 * - "v3"            — Kling v3 Pro style: {name, description, 2-4 equal ref images}, referenced as @name.
 * - "o3-reference"  — Kling O3 reference-to-video style: {name, 2-4 images where image #1 is the frontal
 *                     view and the rest are style references}, rewritten to @ElementN. Description is not
 *                     sent to the API and is not required.
 * - "ksyun"         — Kingsoft Cloud kling-v3-omni style: user-provided {name, description, 2-4 images
 *                     where image #1 is the frontal view}, referenced as @name (rewritten to <<<element_N>>>
 *                     by the provider adapter).
 */
export type KlingElementVariant = "v3" | "o3-reference" | "ksyun";

/** A Kling element is valid when its required fields (per variant) and image count are all set. */
export function isKlingElementValid(
  el: KlingElement | undefined | null,
  variant: KlingElementVariant = "v3"
): boolean {
  if (!el) return false;
  const imageCount = (el.element_input_ids ?? []).length;
  if (imageCount < MIN_IMAGES || imageCount > MAX_IMAGES) return false;
  if (variant === "v3" || variant === "ksyun") {
    if (el.name.trim().length === 0) return false;
    if (el.description.trim().length === 0) return false;
  }
  // o3-reference: name is auto-assigned by the caller as Element{N}, nothing to validate.
  return true;
}

/** Validates the entire elements array — every element must be valid. Empty array is valid (elements are optional). */
export function areKlingElementsValid(
  elements: KlingElement[] | undefined | null,
  variant: KlingElementVariant = "v3"
): boolean {
  if (!elements || elements.length === 0) return true;
  return elements.every((el) => isKlingElementValid(el, variant));
}

interface KlingElementEditorProps {
  elements: KlingElement[];
  onChange: (elements: KlingElement[]) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Opens the asset picker. Called with (elementIndex, maxImages) — the parent should open the picker and call addImageId when done. */
  onPickImages?: (elementIndex: number, maxImages: number) => void;
  /** Resolve an image ID to a display URL. */
  resolveImageUrl?: (imageId: string) => string | undefined;
  /** When true, outside-click collapse is suppressed (e.g. the parent's asset picker modal is open). */
  isAssetPickerOpen?: boolean;
  /** Element schema variant — defaults to "v3" for backwards compatibility. */
  variant?: KlingElementVariant;
  /**
   * When provided, a "Pick from library" button is rendered next to "Add"
   * which opens the asset picker filtered to library elements. Selecting one
   * appends it to this editor's `elements` array with `libraryElementId` set.
   * The parent decides where the click leads (typically: open AssetPickerModal
   * with acceptTypes:["element"] and the create-new CTA).
   */
  onPickFromLibrary?: () => void;
}

export function KlingElementEditor({
  elements,
  onChange,
  disabled = false,
  compact = false,
  onPickImages,
  resolveImageUrl,
  isAssetPickerOpen = false,
  variant = "v3",
  onPickFromLibrary,
}: KlingElementEditorProps) {
  const isO3Reference = variant === "o3-reference";
  const isKsyun = variant === "ksyun";
  const hasFrontalImage = isO3Reference || isKsyun;
  const showNameDescription = !isO3Reference;
  const t = useTranslations("chat.klingElement");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expandedIndex === null) return;
    const handleOutside = (e: MouseEvent) => {
      if (isAssetPickerOpen) return;
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setExpandedIndex(null);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [expandedIndex, isAssetPickerOpen]);

  const addElement = useCallback(() => {
    if (elements.length >= MAX_ELEMENTS) return;
    const newElement: KlingElement = {
      name: isO3Reference ? `Element${elements.length + 1}` : "",
      description: "",
      element_input_ids: [],
    };
    onChange([...elements, newElement]);
    setExpandedIndex(elements.length);
  }, [elements, onChange, isO3Reference]);

  const removeElement = useCallback(
    (index: number) => {
      const next = elements.filter((_, i) => i !== index);
      // o3-reference names are positional (Element1..N) — re-index after removal.
      onChange(
        isO3Reference
          ? next.map((el, i) => ({ ...el, name: `Element${i + 1}` }))
          : next
      );
      if (expandedIndex === index) setExpandedIndex(null);
      else if (expandedIndex !== null && expandedIndex > index)
        setExpandedIndex(expandedIndex - 1);
    },
    [elements, onChange, expandedIndex, isO3Reference]
  );

  const updateElement = useCallback(
    (index: number, updates: Partial<KlingElement>) => {
      onChange(
        elements.map((el, i) => (i === index ? { ...el, ...updates } : el))
      );
    },
    [elements, onChange]
  );

  const addImageId = useCallback(
    (elementIndex: number, imageId: string) => {
      const el = elements[elementIndex];
      if (!el || (el.element_input_ids ?? []).length >= MAX_IMAGES) return;
      updateElement(elementIndex, {
        element_input_ids: [...(el.element_input_ids ?? []), imageId],
      });
    },
    [elements, updateElement]
  );

  const removeImageId = useCallback(
    (elementIndex: number, imageIndex: number) => {
      const el = elements[elementIndex];
      if (!el) return;
      updateElement(elementIndex, {
        element_input_ids: (el.element_input_ids ?? []).filter(
          (_, i) => i !== imageIndex
        ),
      });
    },
    [elements, updateElement]
  );

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-default-500">
          <Sparkles size={14} />
          <span className="font-medium">
            {t("header", { count: elements.length, max: MAX_ELEMENTS })}
          </span>
        </div>
        {!disabled && elements.length < MAX_ELEMENTS && (
          <div className="flex items-center gap-1">
            {onPickFromLibrary && (
              <Button
                size="sm"
                variant="flat"
                color="primary"
                startContent={<Library size={14} />}
                onPress={onPickFromLibrary}
                className="h-6 min-w-0 px-2 text-xs"
              >
                {t("pickFromLibrary")}
              </Button>
            )}
            <Button
              size="sm"
              variant="flat"
              startContent={<Plus size={14} />}
              onPress={addElement}
              className="h-6 min-w-0 px-2 text-xs"
            >
              {t("addButton")}
            </Button>
          </div>
        )}
      </div>

      {elements.length === 0 && !disabled && (
        <button
          onClick={addElement}
          className="w-full rounded-lg border-2 border-dashed border-default-200 p-3 text-xs text-default-400 hover:border-default-300 hover:text-default-500 transition-colors"
        >
          {t("emptyHint", { max: MAX_ELEMENTS })}
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        {elements.map((el, index) => {
          const isExpanded = expandedIndex === index;
          const imageCount = (el.element_input_ids ?? []).length;
          const nameInvalid = showNameDescription && el.name.trim().length === 0;
          const descriptionInvalid =
            showNameDescription && el.description.trim().length === 0;
          const imagesInvalid = imageCount < MIN_IMAGES;
          const isValid = isKlingElementValid(el, variant);

          const coverUrl = resolveImageUrl?.(
            (el.element_input_ids ?? [])[0] ?? ""
          );

          return (
            <div
              key={index}
              className={`rounded-lg border border-divider bg-background/50 overflow-hidden max-w-full ${
                isExpanded ? "w-72" : "w-36 h-36"
              }`}
            >
              {!isExpanded ? (
                <div
                  className="relative w-full h-full cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedIndex(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedIndex(index);
                    }
                  }}
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-default-100" />
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-black/20" />
                  <Sparkles
                    size={14}
                    className={`absolute top-1.5 left-1.5 drop-shadow ${
                      isValid ? "text-secondary" : "text-danger"
                    }`}
                  />
                  {!disabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeElement(index);
                      }}
                      className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white hover:bg-danger transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 text-white">
                    <div className="text-xs font-medium truncate drop-shadow">
                      {el.name
                        ? `@${el.name}`
                        : t("defaultName", { index: index + 1 })}
                    </div>
                    <div
                      className={`text-[10px] drop-shadow ${
                        imagesInvalid ? "text-danger" : "text-white/90"
                      }`}
                    >
                      {t("imageCount", { count: imageCount })}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-default-50 transition-colors cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedIndex(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedIndex(null);
                    }
                  }}
                >
                  <Sparkles
                    size={14}
                    className={
                      isValid
                        ? "text-secondary"
                        : "text-danger"
                    }
                  />
                  <span className="text-xs font-medium flex-1 text-left truncate">
                    {el.name ? `@${el.name}` : t("defaultName", { index: index + 1 })}
                  </span>
                  <span
                    className={`text-[10px] ${imagesInvalid ? "text-danger" : "text-default-400"}`}
                  >
                    {t("imageCount", { count: imageCount })}
                  </span>
                  {!disabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeElement(index);
                      }}
                      className="p-0.5 text-default-400 hover:text-danger transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}

              {isExpanded && (
                <div className="px-2.5 pb-2.5 space-y-2 border-t border-divider pt-2">
                  {showNameDescription && (
                    <Input
                      size="sm"
                      label={t("nameLabel")}
                      placeholder={t("namePlaceholder")}
                      value={el.name}
                      onValueChange={(v) =>
                        updateElement(index, {
                          name: v.replace(/@/g, ""),
                        })
                      }
                      isRequired
                      isInvalid={nameInvalid}
                      errorMessage={nameInvalid ? t("nameRequired") : undefined}
                      description={nameInvalid ? undefined : t("nameHint")}
                      isDisabled={disabled}
                      classNames={{ input: "text-xs", label: "text-xs" }}
                    />
                  )}
                  {showNameDescription && (
                    <Input
                      size="sm"
                      label={t("descriptionLabel")}
                      placeholder={t("descriptionPlaceholder")}
                      value={el.description}
                      onValueChange={(v) =>
                        updateElement(index, { description: v })
                      }
                      isRequired
                      isInvalid={descriptionInvalid}
                      errorMessage={
                        descriptionInvalid ? t("descriptionRequired") : undefined
                      }
                      isDisabled={disabled}
                      classNames={{ input: "text-xs", label: "text-xs" }}
                    />
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-default-500">
                        {t("referenceImages", { count: imageCount, max: MAX_IMAGES })}
                        <span className="text-danger ml-0.5">*</span>
                      </span>
                      {!disabled && imageCount < MAX_IMAGES && (
                        <Button
                          size="sm"
                          variant="flat"
                          startContent={<ImagePlus size={12} />}
                          onPress={() => onPickImages?.(index, MAX_IMAGES - imageCount)}
                          className="h-5 min-w-0 px-1.5 text-[10px]"
                        >
                          {t("addImages")}
                        </Button>
                      )}
                    </div>
                    {hasFrontalImage && (
                      <p className="text-[10px] text-default-400">
                        {t("frontalHint")}
                      </p>
                    )}
                    {imagesInvalid && (
                      <p className="text-[10px] text-danger">
                        {t("imagesRequired", { min: MIN_IMAGES })}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {(el.element_input_ids ?? []).map((imageId, imgIdx) => {
                        const displayUrl = resolveImageUrl?.(imageId);
                        const isFrontal = hasFrontalImage && imgIdx === 0;
                        return (
                          <div
                            key={imgIdx}
                            className={`relative w-12 h-12 rounded-md overflow-hidden border group ${
                              isFrontal
                                ? "border-primary ring-1 ring-primary/50"
                                : "border-divider"
                            }`}
                          >
                            {displayUrl ? (
                              <img
                                src={displayUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-default-100 flex items-center justify-center text-[8px] text-default-400 p-0.5 break-all">
                                {imageId.slice(0, 8)}
                              </div>
                            )}
                            {isFrontal && (
                              <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-white text-[8px] text-center py-0.5 font-medium">
                                {t("frontalBadge")}
                              </div>
                            )}
                            {!disabled && (
                              <button
                                onClick={() => removeImageId(index, imgIdx)}
                                className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
