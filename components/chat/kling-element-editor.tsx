"use client";

import { useCallback, useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Plus, Trash2, Sparkles, ImagePlus, X } from "lucide-react";
import type { KlingElement } from "@/lib/video/models";

const MAX_ELEMENTS = 3;
const MIN_IMAGES = 2;
const MAX_IMAGES = 4;

/** A Kling element is valid when name, description, and ≥ MIN_IMAGES reference images are all set. */
export function isKlingElementValid(el: KlingElement | undefined | null): boolean {
  if (!el) return false;
  const imageCount = (el.element_input_ids ?? []).length;
  return (
    el.name.trim().length > 0 &&
    el.description.trim().length > 0 &&
    imageCount >= MIN_IMAGES &&
    imageCount <= MAX_IMAGES
  );
}

/** Validates the entire elements array — every element must be valid. Empty array is valid (elements are optional). */
export function areKlingElementsValid(
  elements: KlingElement[] | undefined | null
): boolean {
  if (!elements || elements.length === 0) return true;
  return elements.every(isKlingElementValid);
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
}

export function KlingElementEditor({
  elements,
  onChange,
  disabled = false,
  compact = false,
  onPickImages,
  resolveImageUrl,
}: KlingElementEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    elements.length === 0 ? null : 0
  );

  const addElement = useCallback(() => {
    if (elements.length >= MAX_ELEMENTS) return;
    const newElement: KlingElement = {
      name: "",
      description: "",
      element_input_ids: [],
    };
    onChange([...elements, newElement]);
    setExpandedIndex(elements.length);
  }, [elements, onChange]);

  const removeElement = useCallback(
    (index: number) => {
      onChange(elements.filter((_, i) => i !== index));
      if (expandedIndex === index) setExpandedIndex(null);
      else if (expandedIndex !== null && expandedIndex > index)
        setExpandedIndex(expandedIndex - 1);
    },
    [elements, onChange, expandedIndex]
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-default-500">
          <Sparkles size={14} />
          <span className="font-medium">
            Elements ({elements.length}/{MAX_ELEMENTS})
          </span>
        </div>
        {!disabled && elements.length < MAX_ELEMENTS && (
          <Button
            size="sm"
            variant="flat"
            startContent={<Plus size={14} />}
            onPress={addElement}
            className="h-6 min-w-0 px-2 text-xs"
          >
            Add Element
          </Button>
        )}
      </div>

      {elements.length === 0 && !disabled && (
        <button
          onClick={addElement}
          className="w-full rounded-lg border-2 border-dashed border-default-200 p-3 text-xs text-default-400 hover:border-default-300 hover:text-default-500 transition-colors"
        >
          Add elements to reference in your prompt with @name
        </button>
      )}

      <div className="space-y-2">
        {elements.map((el, index) => {
          const isExpanded = expandedIndex === index;
          const imageCount = (el.element_input_ids ?? []).length;
          const nameInvalid = el.name.trim().length === 0;
          const descriptionInvalid = el.description.trim().length === 0;
          const imagesInvalid = imageCount < MIN_IMAGES;
          const isValid = isKlingElementValid(el);

          return (
            <div
              key={index}
              className="rounded-lg border border-divider bg-background/50 overflow-hidden"
            >
              <div
                className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-default-50 transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() =>
                  setExpandedIndex(isExpanded ? null : index)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedIndex(isExpanded ? null : index);
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
                  {el.name ? `@${el.name}` : `Element ${index + 1}`}
                </span>
                <span
                  className={`text-[10px] ${imagesInvalid ? "text-danger" : "text-default-400"}`}
                >
                  {imageCount} image{imageCount !== 1 ? "s" : ""}
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

              {isExpanded && (
                <div className="px-2.5 pb-2.5 space-y-2 border-t border-divider pt-2">
                  <Input
                    size="sm"
                    label="Name"
                    placeholder="dog"
                    value={el.name}
                    onValueChange={(v) =>
                      updateElement(index, {
                        name: v.replace(/@/g, ""),
                      })
                    }
                    isRequired
                    isInvalid={nameInvalid}
                    errorMessage={nameInvalid ? "Name is required" : undefined}
                    description={nameInvalid ? undefined : "Used in prompt as @name"}
                    isDisabled={disabled}
                    classNames={{ input: "text-xs", label: "text-xs" }}
                  />
                  <Input
                    size="sm"
                    label="Description"
                    placeholder="A golden retriever"
                    value={el.description}
                    onValueChange={(v) =>
                      updateElement(index, { description: v })
                    }
                    isRequired
                    isInvalid={descriptionInvalid}
                    errorMessage={
                      descriptionInvalid ? "Description is required" : undefined
                    }
                    isDisabled={disabled}
                    classNames={{ input: "text-xs", label: "text-xs" }}
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-default-500">
                        Reference Images ({imageCount}/{MAX_IMAGES})
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
                          Add
                        </Button>
                      )}
                    </div>
                    {imagesInvalid && (
                      <p className="text-[10px] text-danger">
                        At least {MIN_IMAGES} images required
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {(el.element_input_ids ?? []).map((imageId, imgIdx) => {
                        const displayUrl = resolveImageUrl?.(imageId);
                        return (
                          <div
                            key={imgIdx}
                            className="relative w-12 h-12 rounded-md overflow-hidden border border-divider group"
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
