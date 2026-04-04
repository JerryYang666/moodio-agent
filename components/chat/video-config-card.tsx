"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
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
  PenLine,
  Settings2,
  Camera,
  Hash,
  ChevronDown,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useVideo } from "@/components/video-provider";
import { useCredits } from "@/hooks/use-credits";
import { useGenerateVideoMutation } from "@/lib/redux/services/next-api";
import { getViewportVisibleCenterPosition } from "@/lib/desktop/types";
import type { MessageContentPart } from "@/lib/llm/types";
import { getVideoModel, type VideoModelParam } from "@/lib/video/models";
import { MultiShotEditor } from "./multi-shot-editor";
import { KlingElementEditor } from "./kling-element-editor";
import type { MultiPromptShot, KlingElement } from "@/lib/video/models";

type AgentVideoPart = Extract<MessageContentPart, { type: "agent_video" }>;

const PARAM_ICON_MAP: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  duration: Clock,
  resolution: Monitor,
  aspect_ratio: Maximize,
  generate_audio: Volume2,
  camera_fixed: Camera,
  seed: Hash,
  cfg_scale: Settings2,
};

interface VideoConfigCardProps {
  part: AgentVideoPart;
  sourceImages: Array<{ imageId: string; imageUrl: string; title?: string }>;
  desktopId?: string;
  chatId?: string;
  onStatusChange?: (
    status: AgentVideoPart["status"],
    generationId?: string
  ) => void;
  onSendAsVideoMessage?: (config: {
    modelId: string;
    modelName: string;
    prompt: string;
    sourceImageId: string;
    sourceImageUrl?: string;
    params: Record<string, any>;
    assetImages?: Array<{ imageId: string; imageUrl?: string }>;
  }) => void;
  onPartUpdate?: (updates: Partial<AgentVideoPart>) => Promise<void> | void;
}

export default function VideoConfigCard({
  part,
  sourceImages,
  desktopId,
  chatId,
  onStatusChange,
  onSendAsVideoMessage,
  onPartUpdate,
}: VideoConfigCardProps) {
  const t = useTranslations();
  const { monitorGeneration } = useVideo();
  const { balance } = useCredits();
  const [generateVideo] = useGenerateVideoMutation();
  const [status, setStatus] = useState<AgentVideoPart["status"]>(part.status);
  const [generationId, setGenerationId] = useState<string | undefined>(
    part.generationId
  );
  const [error, setError] = useState<string | undefined>(part.error);
  const [creating, setCreating] = useState(false);

  // Editable state — initialized from the part config (which may already contain saved edits)
  const [editedPrompt, setEditedPrompt] = useState(part.config.prompt);
  const [assetParamImageIds] = useState<Record<string, string>>(() => {
    return { ...part.config.assetParamImageIds };
  });
  const [editedParams, setEditedParams] = useState<Record<string, any>>(() => {
    const initial = { ...part.config.params };
    if (part.config.assetParamImageIds) {
      for (const [paramName, imageId] of Object.entries(part.config.assetParamImageIds)) {
        const match = sourceImages.find((img) => img.imageId === imageId);
        if (match) {
          initial[paramName] = match.imageUrl;
        }
      }
    }
    return initial;
  });

  // Cost estimation
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  const insufficientCredits =
    estimatedCost !== null && balance !== null && balance < estimatedCost;

  const isEditable = status === "pending" || status === "error";

  const modelConfig = useMemo(
    () => getVideoModel(part.config.modelId),
    [part.config.modelId]
  );

  const visibleParams = useMemo(() => {
    if (!modelConfig) return [];
    return modelConfig.params.filter(
      (p) =>
        p.name !== "prompt" &&
        p.name !== modelConfig.imageParams?.sourceImage &&
        p.name !== modelConfig.imageParams?.endImage &&
        p.status !== "hidden" &&
        p.status !== "disabled"
    );
  }, [modelConfig]);

  const gridParams = useMemo(
    () => visibleParams.filter((p) => p.type !== "string" && p.type !== "asset" && p.type !== "multi_prompt" && p.type !== "kling_elements" && p.type !== "media_references"),
    [visibleParams]
  );
  const textParams = useMemo(
    () => visibleParams.filter((p) => p.type === "string"),
    [visibleParams]
  );
  const assetParams = useMemo(
    () => visibleParams.filter((p) => p.type === "asset"),
    [visibleParams]
  );
  const hasMultiPrompt = useMemo(
    () => visibleParams.some((p) => p.type === "multi_prompt"),
    [visibleParams]
  );
  const hasKlingElements = useMemo(
    () => visibleParams.some((p) => p.type === "kling_elements"),
    [visibleParams]
  );

  const isTextToVideo = modelConfig && !modelConfig.imageParams;

  const selectedSourceImage = useMemo(() => {
    if (isTextToVideo) return null;
    if (part.config.sourceImageId) {
      const match = sourceImages.find(
        (img) => img.imageId === part.config.sourceImageId
      );
      if (match) return match;
    }
    return sourceImages[sourceImages.length - 1] || null;
  }, [sourceImages, part.config.sourceImageId, isTextToVideo]);

  const resolveImageUrl = useCallback(
    (imageId: string) => {
      const match = sourceImages.find((img) => img.imageId === imageId);
      return match?.imageUrl;
    },
    [sourceImages]
  );

  const costParamsKey = useMemo(() => {
    const entries = Object.entries(editedParams)
      .filter(
        ([, value]) =>
          value !== undefined && value !== null && value !== ""
      )
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  }, [editedParams]);

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

        Object.entries(editedParams).forEach(([key, value]) => {
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
    if (!isTextToVideo && !selectedSourceImage) {
      addToast({
        title: t("video.noSourceImage"),
        description: t("video.noSourceImageDesc"),
        color: "warning",
      });
      return;
    }

    // Build params for API: substitute display URLs back to image IDs for asset params
    const paramsForApi = { ...editedParams };
    for (const [paramName, imageId] of Object.entries(assetParamImageIds)) {
      if (imageId) paramsForApi[paramName] = imageId;
    }

    const hasEdits =
      editedPrompt !== part.config.prompt ||
      JSON.stringify(editedParams) !== JSON.stringify(part.config.params);

    if (onPartUpdate) {
      await onPartUpdate({
        config: {
          ...part.config,
          prompt: editedPrompt,
          params: paramsForApi,
        },
        ...(hasEdits
          ? { userEdited: true, userEditedAt: Date.now() }
          : {}),
      });
    }

    if (!desktopId && onSendAsVideoMessage) {
      const assetImages: Array<{ imageId: string; imageUrl?: string }> = [];
      for (const [, imageId] of Object.entries(assetParamImageIds)) {
        if (!imageId) continue;
        const match = sourceImages.find((img) => img.imageId === imageId);
        assetImages.push({ imageId, imageUrl: match?.imageUrl });
      }

      onSendAsVideoMessage({
        modelId: part.config.modelId,
        modelName: part.config.modelName,
        prompt: editedPrompt,
        sourceImageId: selectedSourceImage?.imageId || "",
        sourceImageUrl: selectedSourceImage?.imageUrl,
        params: paramsForApi,
        assetImages,
      });
      setStatus("created");
      onStatusChange?.("created");
      return;
    }

    setCreating(true);
    setError(undefined);
    setStatus("creating");
    onStatusChange?.("creating");

    try {
      const result = await generateVideo({
        modelId: part.config.modelId,
        sourceImageId: selectedSourceImage?.imageId || null,
        params: {
          prompt: editedPrompt,
          ...paramsForApi,
        },
      }).unwrap();

      setGenerationId(result.generationId);
      setStatus("created");
      onStatusChange?.("created", result.generationId);

      monitorGeneration(result.generationId);

      if (desktopId) {
        try {
          const pos = getViewportVisibleCenterPosition(300, 300);
          const assetRes = await fetch(`/api/desktop/${desktopId}/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assets: [
                {
                  assetType: "video",
                  metadata: {
                    generationId: result.generationId,
                    imageId: selectedSourceImage?.imageId || "",
                    title: editedPrompt.slice(0, 80),
                    prompt: editedPrompt,
                    status: "processing",
                    modelId: part.config.modelId,
                    chatId,
                  },
                  posX: pos.x,
                  posY: pos.y,
                },
              ],
            }),
          });
          if (assetRes.ok) {
            const assetData = await assetRes.json();
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
          : errorData?.error ||
            e?.message ||
            t("video.failedToStartGeneration");
      setError(errorMessage);
      setStatus("error");
      onStatusChange?.("error");
    } finally {
      setCreating(false);
    }
  }, [
    isTextToVideo,
    selectedSourceImage,
    part.config,
    editedPrompt,
    editedParams,
    assetParamImageIds,
    generateVideo,
    monitorGeneration,
    desktopId,
    chatId,
    onStatusChange,
    onSendAsVideoMessage,
    onPartUpdate,
    t,
  ]);

  const handleParamChange = useCallback((name: string, value: any) => {
    setEditedParams((prev) => ({ ...prev, [name]: value }));
  }, []);

  const getParamIcon = (param: VideoModelParam) => {
    if (param.name === "generate_audio") {
      const value = editedParams[param.name] ?? param.default;
      return value !== false ? Volume2 : VolumeX;
    }
    return PARAM_ICON_MAP[param.name] || Settings2;
  };

  const getParamDisplayValue = (param: VideoModelParam) => {
    const value = editedParams[param.name] ?? param.default ?? "";
    if (param.type === "boolean") {
      return value ? t("common.on") : t("common.off");
    }
    if (
      param.name === "duration" &&
      typeof value === "string" &&
      !value.includes("s")
    ) {
      return `${value}s`;
    }
    return String(value);
  };

  const renderParamCell = (param: VideoModelParam) => {
    const Icon = getParamIcon(param);
    const displayValue = getParamDisplayValue(param);
    const label = param.label || param.name;

    if (param.type === "boolean") {
      const value = editedParams[param.name] ?? param.default ?? false;
      return (
        <div
          key={param.name}
          role={isEditable ? "button" : undefined}
          tabIndex={isEditable ? 0 : undefined}
          className={`flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider ${
            isEditable
              ? "cursor-pointer hover:bg-default-100 transition-colors"
              : ""
          }`}
          onClick={
            isEditable
              ? () => handleParamChange(param.name, !value)
              : undefined
          }
          onKeyDown={
            isEditable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ")
                    handleParamChange(param.name, !value);
                }
              : undefined
          }
        >
          <Icon size={14} className="text-default-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-default-400">{label}</div>
            <div className="text-xs font-medium">{displayValue}</div>
          </div>
        </div>
      );
    }

    if (param.type === "enum" && param.options) {
      if (!isEditable) {
        return (
          <div
            key={param.name}
            className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider"
          >
            <Icon size={14} className="text-default-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-default-400">{label}</div>
              <div className="text-xs font-medium">{displayValue}</div>
            </div>
          </div>
        );
      }
      const value = editedParams[param.name] ?? param.default ?? "";
      return (
        <Dropdown key={param.name}>
          <DropdownTrigger>
            <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider cursor-pointer hover:bg-default-100 transition-colors">
              <Icon size={14} className="text-default-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-default-400">{label}</div>
                <div className="text-xs font-medium flex items-center gap-1">
                  {displayValue}
                  <ChevronDown size={10} className="text-default-400" />
                </div>
              </div>
            </div>
          </DropdownTrigger>
          <DropdownMenu
            disallowEmptySelection
            aria-label={label}
            selectedKeys={
              value !== "" ? new Set([String(value)]) : new Set<string>()
            }
            selectionMode="single"
            variant="flat"
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) {
                const original = param.options?.find(
                  (opt) => String(opt) === selected
                );
                handleParamChange(param.name, original ?? selected);
              }
            }}
          >
            {param.options.map((opt) => (
              <DropdownItem key={String(opt)}>{String(opt)}</DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      );
    }

    if (param.type === "number") {
      const value = editedParams[param.name] ?? param.default ?? "";
      const hasFiniteRange =
        param.min !== undefined &&
        param.max !== undefined &&
        param.max - param.min <= 20;

      if (hasFiniteRange && isEditable) {
        const min = param.min!;
        const max = param.max!;
        const step = max - min <= 1 ? 0.1 : 1;
        const items: string[] = [];
        for (
          let i = min;
          i <= max + Number.EPSILON;
          i = Math.round((i + step) * 10) / 10
        ) {
          items.push(step < 1 ? i.toFixed(1) : String(i));
        }
        return (
          <Dropdown key={param.name}>
            <DropdownTrigger>
              <div className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider cursor-pointer hover:bg-default-100 transition-colors">
                <Icon size={14} className="text-default-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-default-400">{label}</div>
                  <div className="text-xs font-medium flex items-center gap-1">
                    {String(value) || "—"}
                    <ChevronDown size={10} className="text-default-400" />
                  </div>
                </div>
              </div>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label={label}
              selectedKeys={
                value !== ""
                  ? new Set([String(value)])
                  : new Set<string>()
              }
              selectionMode="single"
              variant="flat"
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                if (selected) handleParamChange(param.name, Number(selected));
              }}
            >
              {items.map((item) => (
                <DropdownItem key={item}>{item}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );
      }

      if (!isEditable) {
        return (
          <div
            key={param.name}
            className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider"
          >
            <Icon size={14} className="text-default-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-default-400">{label}</div>
              <div className="text-xs font-medium">
                {String(value) || "—"}
              </div>
            </div>
          </div>
        );
      }

      return (
        <div
          key={param.name}
          className="flex items-center gap-1.5 bg-background/50 rounded-lg px-2.5 py-1.5 border border-divider"
        >
          <Icon size={14} className="text-default-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-default-400">{label}</div>
            <input
              type="number"
              className="text-xs font-medium w-full bg-transparent outline-none border-none p-0"
              value={value === "" || value === undefined ? "" : value}
              min={param.min}
              max={param.max}
              placeholder={param.description || ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "" || raw === "-") {
                  handleParamChange(
                    param.name,
                    raw === "-" ? raw : undefined
                  );
                  return;
                }
                const num = Number(raw);
                if (!isNaN(num)) handleParamChange(param.name, num);
              }}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Card className="my-3 border border-primary/20 bg-linear-to-br from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10">
      <CardBody className="p-3 sm:p-4 gap-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Video size={16} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              {t("video.videoCreation")}
              {part.userEdited && (
                <Chip
                  size="sm"
                  variant="flat"
                  color="warning"
                  startContent={<PenLine size={10} />}
                  classNames={{
                    base: "h-5 px-1.5",
                    content: "text-[10px] px-0.5",
                  }}
                >
                  Edited
                </Chip>
              )}
            </div>
            <div className="text-xs text-default-500">
              {part.config.modelName}
            </div>
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
          {isEditable ? (
            <textarea
              className="w-full bg-transparent outline-none resize-vertical text-sm whitespace-pre-wrap min-h-24"
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              rows={Math.max(4, editedPrompt.split("\n").length)}
            />
          ) : (
            <div className="whitespace-pre-wrap">{editedPrompt}</div>
          )}
        </div>

        {/* Parameters Grid */}
        {gridParams.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {gridParams.map((param) => renderParamCell(param))}
          </div>
        )}

        {/* String-type params (e.g., negative_prompt) */}
        {textParams.map((param) => {
          const value = editedParams[param.name] ?? param.default ?? "";
          return (
            <div
              key={param.name}
              className="text-sm text-foreground/90 bg-background/50 rounded-lg p-3 border border-divider"
            >
              <div className="text-xs text-default-400 mb-1 font-medium">
                {param.label || param.name}
              </div>
              {isEditable ? (
                <textarea
                  className="w-full bg-transparent outline-none resize-none text-xs whitespace-pre-wrap min-h-6"
                  value={String(value)}
                  onChange={(e) =>
                    handleParamChange(param.name, e.target.value)
                  }
                  rows={1}
                  placeholder={param.description || ""}
                />
              ) : (
                <div className="text-xs whitespace-pre-wrap">
                  {String(value) || "—"}
                </div>
              )}
            </div>
          );
        })}

        {/* Multi-Shot Editor */}
        {hasMultiPrompt && editedParams.multi_shots && (
          <MultiShotEditor
            shots={(editedParams.multi_prompt as MultiPromptShot[]) || []}
            onChange={(shots) => handleParamChange("multi_prompt", shots)}
            disabled={!isEditable}
            compact
          />
        )}

        {/* Kling Element Editor */}
        {hasKlingElements && (
          <KlingElementEditor
            elements={(editedParams.kling_elements as KlingElement[]) || []}
            onChange={(elements) => handleParamChange("kling_elements", elements)}
            disabled={!isEditable}
            compact
            resolveImageUrl={resolveImageUrl}
          />
        )}

        {/* Asset-type params (type: "asset") - preview thumbnails */}
        {assetParams.map((param) => {
          const value = editedParams[param.name];
          const url = typeof value === "string" ? value : null;
          return (
            <div key={param.name} className="flex items-center gap-2">
              <div className="text-xs text-default-400">
                {param.label || param.name}:
              </div>
              {url ? (
                <div className="w-12 h-8 rounded overflow-hidden border border-divider">
                  <img
                    src={url}
                    alt={param.label || param.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <span className="text-xs text-default-300">—</span>
              )}
            </div>
          );
        })}

        {/* Source Image Preview */}
        {!isTextToVideo && selectedSourceImage && (
          <div className="flex items-center gap-2">
            <div className="text-xs text-default-400">
              {t("video.sourceImage")}:
            </div>
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
        {!isTextToVideo && !selectedSourceImage && status === "pending" && (
          <div className="text-xs text-warning bg-warning-50 p-2 rounded-lg">
            {t("video.noSourceImageInChat")}
          </div>
        )}

        {/* Insufficient credits warning */}
        {insufficientCredits && status === "pending" && (
          <div className="text-xs text-danger bg-danger-50 p-2 rounded-lg">
            {t("credits.insufficientCredits")}
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
            startContent={creating ? undefined : <Sparkles size={16} />}
            isLoading={creating}
            isDisabled={(!isTextToVideo && !selectedSourceImage) || creating || insufficientCredits}
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
