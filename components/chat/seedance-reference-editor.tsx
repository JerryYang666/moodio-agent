"use client";

import { useCallback, useMemo } from "react";
import { Button } from "@heroui/button";
import { ImagePlus, Film, Music, X, Layers, Pin } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MediaReference } from "@/lib/video/models";

const MAX_IMAGES = 9;
const MAX_VIDEOS = 3;
const MAX_AUDIOS = 3;
const MAX_COMBINED_VIDEO_SECONDS = 15;

interface SeedanceReferenceEditorProps {
  references: MediaReference[];
  onChange: (refs: MediaReference[]) => void;
  disabled?: boolean;
  onPickImage?: () => void;
  onPickVideo?: () => void;
  onPickAudio?: () => void;
  resolveImageUrl?: (id: string) => string | undefined;
  resolveVideoUrl?: (id: string) => string | undefined;
  resolveAudioUrl?: (id: string) => string | undefined;
  maxImages?: number;
  maxVideos?: number;
  maxAudios?: number;
  videoDurations?: Record<string, number>;
  maxCombinedVideoSeconds?: number;
}

function getRefName(refs: MediaReference[], index: number): string {
  const ref = refs[index];
  let count = 0;
  for (let i = 0; i <= index; i++) {
    if (refs[i].type === ref.type) count++;
  }
  if (ref.type === "image") return `image${count}`;
  if (ref.type === "video") return `video${count}`;
  return `audio${count}`;
}

export function SeedanceReferenceEditor({
  references,
  onChange,
  disabled = false,
  onPickImage,
  onPickVideo,
  onPickAudio,
  resolveImageUrl,
  resolveVideoUrl,
  resolveAudioUrl,
  maxImages = MAX_IMAGES,
  maxVideos = MAX_VIDEOS,
  maxAudios = MAX_AUDIOS,
  videoDurations,
  maxCombinedVideoSeconds = MAX_COMBINED_VIDEO_SECONDS,
}: SeedanceReferenceEditorProps) {
  const t = useTranslations("chat.seedanceReference");
  const imageCount = references.filter((r) => r.type === "image").length;
  const videoCount = references.filter((r) => r.type === "video").length;
  const audioCount = references.filter((r) => r.type === "audio").length;
  const allowsImages = maxImages > 0;
  const allowsVideos = maxVideos > 0;
  const allowsAudios = maxAudios > 0;

  const imagesOnly = allowsImages && !allowsVideos && !allowsAudios;

  const headerLabel = imagesOnly
    ? t("headerImages", { count: references.length })
    : t("header", { count: references.length });

  const emptyHint = imagesOnly
    ? t("emptyHintImages")
    : t("emptyHintMixed");

  const combinedVideoSeconds = useMemo(() => {
    if (!videoDurations) return 0;
    return references
      .filter((r) => r.type === "video")
      .reduce((acc, r) => acc + (videoDurations[r.id] ?? 0), 0);
  }, [references, videoDurations]);

  const videoOverCap = combinedVideoSeconds > maxCombinedVideoSeconds;

  const removeReference = useCallback(
    (index: number) => {
      onChange(references.filter((_, i) => i !== index));
    },
    [references, onChange]
  );

  const togglePin = useCallback(
    (index: number) => {
      onChange(
        references.map((ref, i) =>
          i === index ? { ...ref, pinned: !ref.pinned } : ref
        )
      );
    },
    [references, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-default-500">
          <Layers size={14} />
          <span className="font-medium">{headerLabel}</span>
          {allowsVideos && videoCount > 0 && videoDurations && (
            <span className={`ml-1 ${videoOverCap ? "text-danger font-medium" : ""}`}>
              &middot;{" "}
              {t("videoDuration", {
                seconds: combinedVideoSeconds.toFixed(1),
                max: maxCombinedVideoSeconds,
              })}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {!disabled && allowsImages && imageCount < maxImages && (
            <Button
              size="sm"
              variant="flat"
              startContent={<ImagePlus size={14} />}
              onPress={onPickImage}
              className="h-6 min-w-0 px-2 text-xs"
            >
              {t("imageButton")}
            </Button>
          )}
          {!disabled && allowsVideos && videoCount < maxVideos && (
            <Button
              size="sm"
              variant="flat"
              startContent={<Film size={14} />}
              onPress={onPickVideo}
              className="h-6 min-w-0 px-2 text-xs"
            >
              {t("videoButton")}
            </Button>
          )}
          {!disabled && allowsAudios && audioCount < maxAudios && (
            <Button
              size="sm"
              variant="flat"
              startContent={<Music size={14} />}
              onPress={onPickAudio}
              className="h-6 min-w-0 px-2 text-xs"
            >
              {t("audioButton")}
            </Button>
          )}
        </div>
      </div>

      {references.length === 0 && !disabled && (
        <button
          onClick={allowsImages ? onPickImage : allowsVideos ? onPickVideo : onPickAudio}
          className="w-full rounded-lg border-2 border-dashed border-default-200 p-3 text-xs text-default-400 hover:border-default-300 hover:text-default-500 transition-colors"
        >
          {emptyHint}
        </button>
      )}

      {references.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {references.map((ref, index) => {
            const name = getRefName(references, index);
            const displayUrl =
              ref.type === "image"
                ? resolveImageUrl?.(ref.id)
                : ref.type === "video"
                  ? resolveVideoUrl?.(ref.id)
                  : resolveAudioUrl?.(ref.id);

            return (
              <div
                key={`${ref.type}-${ref.id}-${index}`}
                className={`relative w-14 h-14 rounded-md overflow-hidden border group ${
                  ref.pinned ? "border-primary ring-1 ring-primary/50" : "border-divider"
                }`}
              >
                {ref.type === "audio" ? (
                  <div className="w-full h-full bg-linear-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center">
                    <Music size={16} className="text-violet-400" />
                  </div>
                ) : displayUrl ? (
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
                  <>
                    <button
                      onClick={() => togglePin(index)}
                      className={`absolute top-0 left-0 p-0.5 rounded-br-md transition-opacity ${
                        ref.pinned
                          ? "bg-primary text-white opacity-100"
                          : "bg-black/60 text-white opacity-0 group-hover:opacity-100"
                      }`}
                      title={ref.pinned ? t("unpin") : t("pin")}
                    >
                      <Pin size={10} />
                    </button>
                    <button
                      onClick={() => removeReference(index)}
                      className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
