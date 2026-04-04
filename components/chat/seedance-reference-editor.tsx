"use client";

import { useCallback } from "react";
import { Button } from "@heroui/button";
import { ImagePlus, Film, X, Layers } from "lucide-react";
import type { MediaReference } from "@/lib/video/models";

const MAX_IMAGES = 9;
const MAX_VIDEOS = 3;

interface SeedanceReferenceEditorProps {
  references: MediaReference[];
  onChange: (refs: MediaReference[]) => void;
  disabled?: boolean;
  onPickImage?: () => void;
  onPickVideo?: () => void;
  resolveImageUrl?: (id: string) => string | undefined;
  resolveVideoUrl?: (id: string) => string | undefined;
  maxImages?: number;
  maxVideos?: number;
}

function getRefName(refs: MediaReference[], index: number): string {
  const ref = refs[index];
  let count = 0;
  for (let i = 0; i <= index; i++) {
    if (refs[i].type === ref.type) count++;
  }
  return ref.type === "image" ? `image${count}` : `video${count}`;
}

export function SeedanceReferenceEditor({
  references,
  onChange,
  disabled = false,
  onPickImage,
  onPickVideo,
  resolveImageUrl,
  resolveVideoUrl,
  maxImages = MAX_IMAGES,
  maxVideos = MAX_VIDEOS,
}: SeedanceReferenceEditorProps) {
  const imageCount = references.filter((r) => r.type === "image").length;
  const videoCount = references.filter((r) => r.type === "video").length;

  const removeReference = useCallback(
    (index: number) => {
      onChange(references.filter((_, i) => i !== index));
    },
    [references, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-default-500">
          <Layers size={14} />
          <span className="font-medium">
            References ({references.length})
          </span>
        </div>
        <div className="flex gap-1">
          {!disabled && imageCount < maxImages && (
            <Button
              size="sm"
              variant="flat"
              startContent={<ImagePlus size={14} />}
              onPress={onPickImage}
              className="h-6 min-w-0 px-2 text-xs"
            >
              Image
            </Button>
          )}
          {!disabled && videoCount < maxVideos && (
            <Button
              size="sm"
              variant="flat"
              startContent={<Film size={14} />}
              onPress={onPickVideo}
              className="h-6 min-w-0 px-2 text-xs"
            >
              Video
            </Button>
          )}
        </div>
      </div>

      {references.length === 0 && !disabled && (
        <button
          onClick={onPickImage}
          className="w-full rounded-lg border-2 border-dashed border-default-200 p-3 text-xs text-default-400 hover:border-default-300 hover:text-default-500 transition-colors"
        >
          Add reference images or videos to mention in your prompt with @image1
          / @video1
        </button>
      )}

      {references.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {references.map((ref, index) => {
            const name = getRefName(references, index);
            const displayUrl =
              ref.type === "image"
                ? resolveImageUrl?.(ref.id)
                : resolveVideoUrl?.(ref.id);

            return (
              <div
                key={`${ref.type}-${ref.id}-${index}`}
                className="relative w-14 h-14 rounded-md overflow-hidden border border-divider group"
              >
                {displayUrl ? (
                  ref.type === "image" ? (
                    <img
                      src={displayUrl}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={displayUrl}
                      className="w-full h-full object-cover"
                      muted
                    />
                  )
                ) : (
                  <div className="w-full h-full bg-default-100 flex items-center justify-center">
                    {ref.type === "image" ? (
                      <ImagePlus size={16} className="text-default-300" />
                    ) : (
                      <Film size={16} className="text-default-300" />
                    )}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 font-medium">
                  @{name}
                </div>
                {!disabled && (
                  <button
                    onClick={() => removeReference(index)}
                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
