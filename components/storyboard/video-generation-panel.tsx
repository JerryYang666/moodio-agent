"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Image } from "@heroui/image";
import { Divider } from "@heroui/divider";
import { Video, ImageIcon, Sparkles, X, Plus } from "lucide-react";
import AssetPickerModal, {
  AssetSummary,
} from "@/components/chat/asset-picker-modal";
import { useVideo } from "@/components/video-provider";

interface VideoModelParam {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum" | "string_array";
  required: boolean;
  default?: string | number | boolean | string[];
  options?: string[];
  description?: string;
  min?: number;
  max?: number;
  maxItems?: number;
}

interface VideoModelConfig {
  id: string;
  name: string;
  description?: string;
  imageParams: {
    sourceImage: string;
    endImage?: string;
  };
  params: VideoModelParam[];
}

interface VideoGenerationPanelProps {
  initialImageId?: string | null;
  initialImageUrl?: string | null;
  onGenerationStarted?: (generationId: string) => void;
}

export default function VideoGenerationPanel({
  initialImageId,
  initialImageUrl,
  onGenerationStarted,
}: VideoGenerationPanelProps) {
  const t = useTranslations("video");
  const tCommon = useTranslations("common");
  const { monitorGeneration } = useVideo();
  const [models, setModels] = useState<VideoModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [sourceImageId, setSourceImageId] = useState<string | null>(
    initialImageId || null
  );
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(
    initialImageUrl || null
  );
  const [endImageId, setEndImageId] = useState<string | null>(null);
  const [endImageUrl, setEndImageUrl] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, any>>({});

  // Asset picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"source" | "end">("source");

  // String array input state (for voice_ids etc.)
  const [arrayInputValues, setArrayInputValues] = useState<
    Record<string, string>
  >({});

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch("/api/video/models");
        if (!res.ok) throw new Error(t("failedToLoadVideoModels"));
        const data = await res.json();
        setModels(data.models);
        setDefaultModelId(data.defaultModelId);
        setSelectedModelId(data.defaultModelId);
      } catch (e) {
        setError(t("failedToLoadVideoModels"));
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadModels();
  }, []);

  // Initialize params when model changes
  useEffect(() => {
    if (!selectedModelId) return;
    const model = models.find((m) => m.id === selectedModelId);
    if (!model) return;

    const initialParams: Record<string, any> = {};
    for (const param of model.params) {
      // Skip image params - handled separately
      if (
        param.name === model.imageParams.sourceImage ||
        param.name === model.imageParams.endImage
      ) {
        continue;
      }
      if (param.default !== undefined) {
        initialParams[param.name] = param.default;
      }
    }
    setParams(initialParams);
  }, [selectedModelId, models]);

  const selectedModel = models.find((m) => m.id === selectedModelId);

  const handleParamChange = (name: string, value: any) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const openPicker = (target: "source" | "end") => {
    setPickerTarget(target);
    setPickerOpen(true);
  };

  const handleAssetSelect = (asset: AssetSummary) => {
    if (pickerTarget === "source") {
      setSourceImageId(asset.imageId);
      setSourceImageUrl(asset.imageUrl);
    } else {
      setEndImageId(asset.imageId);
      setEndImageUrl(asset.imageUrl);
    }
  };

  const handleUpload = async (file: File) => {
    // Upload file and get imageId
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/image/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(t("failedToUploadImage"));
      const data = await res.json();

      if (pickerTarget === "source") {
        setSourceImageId(data.imageId);
        setSourceImageUrl(data.imageUrl);
      } else {
        setEndImageId(data.imageId);
        setEndImageUrl(data.imageUrl);
      }
    } catch (e) {
      console.error("Upload error:", e);
      setError(t("failedToUploadImage"));
    }
  };

  const handleGenerate = async () => {
    if (!sourceImageId) {
      setError(t("selectSourceImageError"));
      return;
    }

    if (!params.prompt?.trim()) {
      setError(t("enterPromptError"));
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedModelId,
          sourceImageId,
          endImageId,
          params,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("failedToStartGeneration"));
      }

      const data = await res.json();

      // Start monitoring for notifications
      monitorGeneration(data.generationId);

      onGenerationStarted?.(data.generationId);

      // Reset form
      setSourceImageId(null);
      setSourceImageUrl(null);
      setEndImageId(null);
      setEndImageUrl(null);
      setParams((prev) => ({ ...prev, prompt: "" }));
    } catch (e: any) {
      setError(e.message || t("failedToStartGeneration"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardBody className="flex items-center justify-center">
          <Spinner />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-col items-start gap-1 pb-2 shrink-0 px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Video size={20} className="text-primary" />
            <h2 className="text-base sm:text-lg font-semibold">
              {t("generateVideo")}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-default-500">
            {t("generateVideoDesc")}
          </p>
        </CardHeader>

        <CardBody className="gap-3 sm:gap-4 pt-0 overflow-auto flex-1 px-3 sm:px-4">
          {/* Model Selector */}
          <Select
            label={t("model")}
            selectedKeys={selectedModelId ? [selectedModelId] : []}
            onChange={(e) => setSelectedModelId(e.target.value)}
            description={selectedModel?.description}
          >
            {models.map((model) => (
              <SelectItem key={model.id}>{model.name}</SelectItem>
            ))}
          </Select>

          <Divider />

          {/* Source Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("sourceImage")}</span>
              <Button
                size="sm"
                variant="flat"
                onPress={() => openPicker("source")}
              >
                {sourceImageId ? tCommon("change") : tCommon("select")}
              </Button>
            </div>
            {sourceImageUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-divider">
                <Image
                  src={sourceImageUrl}
                  alt={t("sourceImageAlt")}
                  classNames={{
                    wrapper: "w-full aspect-video",
                    img: "w-full h-full object-cover",
                  }}
                />
                <Button
                  isIconOnly
                  size="sm"
                  variant="flat"
                  className="absolute top-2 right-2 bg-background/80"
                  onPress={() => {
                    setSourceImageId(null);
                    setSourceImageUrl(null);
                  }}
                >
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => openPicker("source")}
                className="w-full aspect-video rounded-lg border-2 border-dashed border-default-300 flex flex-col items-center justify-center gap-2 hover:border-primary transition-colors"
              >
                <ImageIcon size={32} className="text-default-400" />
                <span className="text-sm text-default-500">
                  {t("clickToSelectFirstFrame")}
                </span>
              </button>
            )}
          </div>

          {/* End Image (optional) */}
          {selectedModel?.imageParams.endImage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("endImage")}</span>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => openPicker("end")}
                >
                  {endImageId ? tCommon("change") : tCommon("select")}
                </Button>
              </div>
              {endImageUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-divider">
                  <Image
                    src={endImageUrl}
                    alt={t("endImageAlt")}
                    classNames={{
                      wrapper: "w-full aspect-video",
                      img: "w-full h-full object-cover",
                    }}
                  />
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    className="absolute top-2 right-2 bg-background/80"
                    onPress={() => {
                      setEndImageId(null);
                      setEndImageUrl(null);
                    }}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => openPicker("end")}
                  className="w-full aspect-video rounded-lg border-2 border-dashed border-default-300 flex flex-col items-center justify-center gap-2 hover:border-primary transition-colors"
                >
                  <ImageIcon size={24} className="text-default-400" />
                  <span className="text-xs text-default-500">
                    {t("selectLastFrame")}
                  </span>
                </button>
              )}
            </div>
          )}

          <Divider />

          {/* Dynamic Parameters */}
          {selectedModel?.params
            .filter(
              (p) =>
                p.name !== selectedModel.imageParams.sourceImage &&
                p.name !== selectedModel.imageParams.endImage
            )
            .map((param) => {
              const value = params[param.name] ?? param.default ?? "";

              if (param.type === "enum" && param.options) {
                return (
                  <Select
                    key={param.name}
                    label={param.label}
                    selectedKeys={value ? [String(value)] : []}
                    onChange={(e) =>
                      handleParamChange(param.name, e.target.value)
                    }
                    description={param.description}
                    isRequired={param.required}
                  >
                    {param.options.map((opt) => (
                      <SelectItem key={opt}>{opt}</SelectItem>
                    ))}
                  </Select>
                );
              }

              if (param.type === "boolean") {
                return (
                  <div
                    key={param.name}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <span className="text-sm">{param.label}</span>
                      {param.description && (
                        <p className="text-xs text-default-400">
                          {param.description}
                        </p>
                      )}
                    </div>
                    <Switch
                      isSelected={Boolean(value)}
                      onValueChange={(v) => handleParamChange(param.name, v)}
                    />
                  </div>
                );
              }

              if (param.type === "number") {
                return (
                  <Input
                    key={param.name}
                    type="number"
                    label={param.label}
                    value={String(value)}
                    onValueChange={(v) => handleParamChange(param.name, v)}
                    description={param.description}
                    isRequired={param.required}
                    min={param.min}
                    max={param.max}
                  />
                );
              }

              // String array type - tag-style input
              if (param.type === "string_array") {
                const arrayValue: string[] = Array.isArray(value) ? value : [];
                const canAddMore =
                  !param.maxItems || arrayValue.length < param.maxItems;
                const inputValue = arrayInputValues[param.name] || "";

                const addItem = () => {
                  const trimmed = inputValue.trim();
                  if (trimmed) {
                    handleParamChange(param.name, [...arrayValue, trimmed]);
                    setArrayInputValues((prev) => ({
                      ...prev,
                      [param.name]: "",
                    }));
                  }
                };

                return (
                  <div key={param.name} className="space-y-2">
                    <div>
                      <span className="text-sm">{param.label}</span>
                      {param.description && (
                        <p className="text-xs text-default-400">
                          {param.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {arrayValue.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1 bg-default-100 px-2 py-1 rounded-md text-sm"
                        >
                          <span className="font-mono">{item}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newArray = arrayValue.filter(
                                (_, i) => i !== idx
                              );
                              handleParamChange(
                                param.name,
                                newArray.length > 0 ? newArray : undefined
                              );
                            }}
                            className="text-default-400 hover:text-danger transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {canAddMore && (
                        <Input
                          size="sm"
                          placeholder={
                            param.maxItems
                              ? t("addVoiceIdWithCount", {
                                  current: arrayValue.length,
                                  max: param.maxItems,
                                })
                              : t("addVoiceId")
                          }
                          classNames={{
                            base: "w-full sm:w-48",
                            input: "font-mono text-sm",
                          }}
                          value={inputValue}
                          onValueChange={(v) =>
                            setArrayInputValues((prev) => ({
                              ...prev,
                              [param.name]: v,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addItem();
                            }
                          }}
                          endContent={
                            <button
                              type="button"
                              className="text-default-400 hover:text-primary transition-colors"
                              onClick={addItem}
                            >
                              <Plus size={16} />
                            </button>
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // String type - use Textarea for prompt
              if (param.name === "prompt") {
                return (
                  <Textarea
                    key={param.name}
                    label={param.label}
                    value={String(value)}
                    onValueChange={(v) => handleParamChange(param.name, v)}
                    description={param.description}
                    isRequired={param.required}
                    minRows={3}
                    placeholder={t("promptPlaceholder")}
                  />
                );
              }

              return (
                <Input
                  key={param.name}
                  label={param.label}
                  value={String(value)}
                  onValueChange={(v) => handleParamChange(param.name, v)}
                  description={param.description}
                  isRequired={param.required}
                />
              );
            })}
        </CardBody>

        {/* Fixed Footer with Error and Button */}
        <div className="p-3 sm:p-4 pt-2 border-t border-divider shrink-0 space-y-2 sm:space-y-3 safe-area-bottom">
          {/* Error Message */}
          {error && (
            <div className="text-xs sm:text-sm text-danger bg-danger-50 p-2 sm:p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Generate Button */}
          <Button
            color="primary"
            size="lg"
            className="w-full text-sm sm:text-base"
            startContent={!submitting && <Sparkles size={18} />}
            isLoading={submitting}
            isDisabled={!sourceImageId || !params.prompt?.trim()}
            onPress={handleGenerate}
          >
            {submitting ? t("starting") : t("generateVideo")}
          </Button>
        </div>
      </Card>

      {/* Asset Picker Modal */}
      <AssetPickerModal
        isOpen={pickerOpen}
        onOpenChange={() => setPickerOpen(false)}
        onSelect={handleAssetSelect}
        onUpload={handleUpload}
      />
    </>
  );
}
