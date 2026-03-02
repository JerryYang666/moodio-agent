"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import {
  Video,
  Clock,
  Monitor,
  Volume2,
  VolumeX,
  Bean,
  Sparkles,
  Check,
  AlertCircle,
  Maximize,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useVideo } from "@/components/video-provider";
import { useGenerateVideoMutation } from "@/lib/redux/services/next-api";
import type { MessageContentPart } from "@/lib/llm/types";

type AgentVideoPart = Extract<MessageContentPart, { type: "agent_video" }>;

interface VideoConfigCardProps {
  part: AgentVideoPart;
  /** Available source images from the conversation (imageId -> imageUrl) */
  sourceImages: Array<{ imageId: string; imageUrl: string; title?: string }>;
  /** Desktop ID if viewing from desktop page - enables adding asset to desktop */
  desktopId?: string;
  /** Chat ID for linking */
  chatId?: string;
  /** Callback when video creation status changes */
  onStatusChange?: (
    status: AgentVideoPart["status"],
    generationId?: string
  ) => void;
}

export default function VideoConfigCard({
  part,
  sourceImages,
  desktopId,
  chatId,
  onStatusChange,
}: VideoConfigCardProps) {
  const t = useTranslations();
  const { monitorGeneration } = useVideo();
  const [generateVideo] = useGenerateVideoMutation();
  const [status, setStatus] = useState<AgentVideoPart["status"]>(part.status);
  const [generationId, setGenerationId] = useState<string | undefined>(
    part.generationId
  );
  const [error, setError] = useState<string | undefined>(part.error);
  const [creating, setCreating] = useState(false);

  // Cost estimation
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // Use the most recent source image by default
  const selectedSourceImage = sourceImages[sourceImages.length - 1] || null;

  // Memoize cost params to avoid unnecessary refetches
  const costParamsKey = useMemo(() => {
    const entries = Object.entries(part.config.params)
      .filter(
        ([, value]) =>
          value !== undefined && value !== null && value !== ""
      )
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  }, [part.config.params]);

  // Fetch cost preview
  useEffect(() => {
    if (!part.config.modelId || status !== "pending") {
      setEstimatedCost(null);
      return;
    }

    const fetchCost = async () => {
      setCostLoading(true);
      try {
        const searchParams = new URLSearchParams();
        searchParams.set("modelId", part.config.modelId);

        Object.entries(part.config.params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            searchParams.set(key, String(value));
          }
        });

        const res = await fetch(`/api/video/cost?${searchParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setEstimatedCost(data.cost);
        }
      } catch (e) {
        console.error("Failed to fetch video cost:", e);
      } finally {
        setCostLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchCost, 300);
    return () => clearTimeout(timeoutId);
  }, [part.config.modelId, costParamsKey, status]);

  const handleCreate = useCallback(async () => {
    if (!selectedSourceImage) {
      addToast({
        title: t("video.noSourceImage"),
        description: t("video.noSourceImageDesc"),
        color: "warning",
      });
      return;
    }

    setCreating(true);
    setError(undefined);
    setStatus("creating");
    onStatusChange?.("creating");

    try {
      const result = await generateVideo({
        modelId: part.config.modelId,
        sourceImageId: selectedSourceImage.imageId,
        params: {
          prompt: part.config.prompt,
          ...part.config.params,
        },
      }).unwrap();

      setGenerationId(result.generationId);
      setStatus("created");
      onStatusChange?.("created", result.generationId);

      // Start monitoring for completion
      monitorGeneration(result.generationId);

      // Add video as desktop asset if on desktop page
      if (desktopId) {
        try {
          const assetRes = await fetch(`/api/desktop/${desktopId}/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assets: [
                {
                  assetType: "video",
                  metadata: {
                    generationId: result.generationId,
                    imageId: selectedSourceImage.imageId,
                    title: part.config.prompt.slice(0, 80),
                    prompt: part.config.prompt,
                    status: "processing",
                    modelId: part.config.modelId,
                    chatId,
                  },
                  posX: Math.random() * 200,
                  posY: Math.random() * 200,
                },
              ],
            }),
          });
          if (assetRes.ok) {
            const assetData = await assetRes.json();
            // Dispatch event so the desktop page can add the asset to the canvas
            window.dispatchEvent(
              new CustomEvent("desktop-asset-added", {
                detail: { assets: assetData.assets, desktopId },
              })
            );
          }
        } catch (e) {
          console.error("Failed to add video asset to desktop:", e);
        }
      }

      addToast({
        title: t("video.generationStarted"),
        color: "success",
      });
    } catch (e: any) {
      const errorData = e?.data || e;
      const errorMessage =
        errorData?.error === "INSUFFICIENT_CREDITS"
          ? t("credits.insufficientCredits")
          : errorData?.error || e?.message || t("video.failedToStartGeneration");
      setError(errorMessage);
      setStatus("error");
      onStatusChange?.("error");
    } finally {
      setCreating(false);
    }
  }, [
    selectedSourceImage,
    part.config,
    generateVideo,
    monitorGeneration,
    desktopId,
    chatId,
    onStatusChange,
    t,
  ]);

  // Parameter display helpers
  const params = part.config.params;
  const duration = params.duration || "5";
  const resolution = params.resolution || "720p";
  const aspectRatio = params.aspect_ratio || "16:9";
  const generateAudio = params.generate_audio !== false;

  return (
    <Card className="my-3 border border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10">
      <CardBody className="p-3 sm:p-4 gap-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Video size={16} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{t("video.videoCreation")}</div>
            <div className="text-xs text-default-500">{part.config.modelName}</div>
          </div>
          {status === "created" && (
            <Chip
              size="sm"
              color="success"
              variant="flat"
              startContent={<Check size={12} />}
            >
              {t("video.createdStatus")}
            </Chip>
          )}
          {status === "error" && (
            <Chip
              size="sm"
              color="danger"
              variant="flat"
              startContent={<AlertCircle size={12} />}
            >
              {t("common.error")}
            </Chip>
          )}
        </div>

        {/* Prompt */}
        <div className="text-sm text-foreground/90 bg-background/50 rounded-lg p-3 border border-divider">
          <div className="text-xs text-default-400 mb-1 font-medium">
            {t("video.prompt")}
          </div>
          <div className="whitespace-pre-wrap">{part.config.prompt}</div>
        </div>

        {/* Parameters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider">
            <Clock size={14} className="text-default-400 shrink-0" />
            <div>
              <div className="text-[10px] text-default-400">{t("video.durationLabel")}</div>
              <div className="text-xs font-medium">{duration}s</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider">
            <Monitor size={14} className="text-default-400 shrink-0" />
            <div>
              <div className="text-[10px] text-default-400">{t("video.resolution")}</div>
              <div className="text-xs font-medium">{resolution}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider">
            <Maximize size={14} className="text-default-400 shrink-0" />
            <div>
              <div className="text-[10px] text-default-400">{t("video.aspectRatio")}</div>
              <div className="text-xs font-medium">{aspectRatio}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider">
            {generateAudio ? (
              <Volume2 size={14} className="text-default-400 shrink-0" />
            ) : (
              <VolumeX size={14} className="text-default-400 shrink-0" />
            )}
            <div>
              <div className="text-[10px] text-default-400">{t("video.audio")}</div>
              <div className="text-xs font-medium">
                {generateAudio ? t("common.on") : t("common.off")}
              </div>
            </div>
          </div>
        </div>

        {/* Source Image Preview */}
        {selectedSourceImage && (
          <div className="flex items-center gap-2">
            <div className="text-xs text-default-400">{t("video.sourceImage")}:</div>
            <div className="w-12 h-8 rounded overflow-hidden border border-divider">
              <img
                src={selectedSourceImage.imageUrl}
                alt={t("video.sourceImageAlt")}
                className="w-full h-full object-cover"
              />
            </div>
            {selectedSourceImage.title && (
              <span className="text-xs text-default-500 truncate">
                {selectedSourceImage.title}
              </span>
            )}
          </div>
        )}

        {/* No source image warning */}
        {!selectedSourceImage && status === "pending" && (
          <div className="text-xs text-warning bg-warning-50 p-2 rounded-lg">
            {t("video.noSourceImageInChat")}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="text-xs text-danger bg-danger-50 p-2 rounded-lg">
            {error}
          </div>
        )}
      </CardBody>

      {/* Footer with Create Button */}
      {(status === "pending" || status === "error") && (
        <CardFooter className="px-3 sm:px-4 py-2 border-t border-divider">
          <Button
            color="primary"
            size="md"
            className="w-full"
            startContent={
              creating ? undefined : <Sparkles size={16} />
            }
            isLoading={creating}
            isDisabled={!selectedSourceImage || creating}
            onPress={handleCreate}
          >
            {creating ? (
              t("video.creating")
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>{t("video.createVideo")}</span>
                {!costLoading && estimatedCost !== null && (
                  <span className="flex items-center gap-1 font-semibold">
                    <Bean size={14} />
                    <span>{estimatedCost.toLocaleString()}</span>
                  </span>
                )}
                {costLoading && <Spinner size="sm" />}
              </span>
            )}
          </Button>
        </CardFooter>
      )}

      {/* Created state - show generation info */}
      {status === "created" && generationId && (
        <CardFooter className="px-3 sm:px-4 py-2 border-t border-divider">
          <div className="flex items-center gap-2 w-full">
            <Spinner size="sm" />
            <span className="text-xs text-default-500">
              {t("video.generationInProgress")}
            </span>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
