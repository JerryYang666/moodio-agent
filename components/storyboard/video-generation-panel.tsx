"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { Card, CardBody, CardHeader, CardFooter } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Image } from "@heroui/image";
import { Divider } from "@heroui/divider";
import { Video, ImageIcon, Sparkles, X, Plus, Bean } from "lucide-react";
import AssetPickerModal, {
  AssetSummary,
} from "@/components/chat/asset-picker-modal";
import { useVideo } from "@/components/video-provider";
import { uploadImage } from "@/lib/upload/client";

interface VideoModelParam {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum" | "string_array";
  required: boolean;
  default?: string | number | boolean | string[];
  options?: Array<string | number>;
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

// Data structure for restoring a previous generation
export interface VideoGenerationRestore {
  modelId: string;
  sourceImageId: string;
  sourceImageUrl: string;
  endImageId: string | null;
  endImageUrl: string | null;
  params: Record<string, any>;
}

interface VideoGenerationPanelProps {
  initialImageId?: string | null;
  initialImageUrl?: string | null;
  onGenerationStarted?: (generationId: string) => void;
  restoreData?: VideoGenerationRestore | null;
  onRestoreComplete?: () => void;
}

// localStorage key prefix for model parameters
const STORAGE_KEY_PREFIX = "video-model-params-";

// Get localStorage key for a specific model
const getStorageKey = (modelId: string) => `${STORAGE_KEY_PREFIX}${modelId}`;

// Save model params to localStorage (excluding images and prompt)
const saveModelParams = (modelId: string, params: Record<string, any>) => {
  if (typeof window === "undefined") return;
  
  // Filter out prompt and any image-related params
  const paramsToSave: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    // Skip prompt and image URLs
    if (
      key === "prompt" ||
      key.includes("image") ||
      key.includes("url") ||
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }
    paramsToSave[key] = value;
  }
  
  try {
    localStorage.setItem(getStorageKey(modelId), JSON.stringify(paramsToSave));
  } catch (e) {
    console.warn("Failed to save model params to localStorage:", e);
  }
};

// Load model params from localStorage
const loadModelParams = (modelId: string): Record<string, any> | null => {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(getStorageKey(modelId));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("Failed to load model params from localStorage:", e);
  }
  return null;
};

export default function VideoGenerationPanel({
  initialImageId,
  initialImageUrl,
  onGenerationStarted,
  restoreData,
  onRestoreComplete,
}: VideoGenerationPanelProps) {
  const t = useTranslations("video");
  const tCommon = useTranslations("common");
  const tChat = useTranslations("chat");
  const tCredits = useTranslations("credits");
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

  // Upload state
  const [uploadingTarget, setUploadingTarget] = useState<"source" | "end" | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const isUploading = uploadingTarget !== null;

  // Cost preview state
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // Ref to store pending restore params (used to coordinate between restore and model init effects)
  const pendingRestoreParamsRef = useRef<Record<string, any> | null>(null);

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

  // Initialize params when model changes - merge defaults with saved localStorage values
  // Or use pending restore params if available (from "put back" action)
  useEffect(() => {
    if (!selectedModelId) return;
    const model = models.find((m) => m.id === selectedModelId);
    if (!model) return;

    // Check if we have pending restore params (from "put back" action)
    if (pendingRestoreParamsRef.current) {
      const restoredParams = pendingRestoreParamsRef.current;
      pendingRestoreParamsRef.current = null; // Clear the ref
      setParams(restoredParams);
      return;
    }

    // Start with default params
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
    
    // Load saved params from localStorage and merge (overwrite defaults)
    const savedParams = loadModelParams(selectedModelId);
    if (savedParams) {
      for (const [key, value] of Object.entries(savedParams)) {
        // Only apply saved value if the param still exists in the model
        const paramExists = model.params.some((p) => p.name === key);
        if (paramExists && value !== undefined && value !== null) {
          initialParams[key] = value;
        }
      }
    }
    
    setParams(initialParams);
  }, [selectedModelId, models]);

  // Save params to localStorage when they change (debounced)
  useEffect(() => {
    if (!selectedModelId) return;
    
    const timeoutId = setTimeout(() => {
      saveModelParams(selectedModelId, params);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [selectedModelId, params]);

  // Handle restore data - restore all state from a previous generation
  useEffect(() => {
    if (!restoreData) return;
    
    const model = models.find((m) => m.id === restoreData.modelId);
    if (model) {
      // Build the restored params
      const restoredParams: Record<string, any> = {};
      for (const param of model.params) {
        // Skip image params
        if (
          param.name === model.imageParams.sourceImage ||
          param.name === model.imageParams.endImage
        ) {
          continue;
        }
        // Use restored value if available, otherwise use default
        if (restoreData.params[param.name] !== undefined) {
          restoredParams[param.name] = restoreData.params[param.name];
        } else if (param.default !== undefined) {
          restoredParams[param.name] = param.default;
        }
      }
      
      // If we're changing to a different model, store params in ref so the model init
      // effect will use them instead of defaults/localStorage. Otherwise set directly.
      if (restoreData.modelId !== selectedModelId) {
        pendingRestoreParamsRef.current = restoredParams;
        setSelectedModelId(restoreData.modelId);
      } else {
        // Same model - just set params directly
        setParams(restoredParams);
      }
    }
    
    // Set images
    setSourceImageId(restoreData.sourceImageId);
    setSourceImageUrl(restoreData.sourceImageUrl);
    setEndImageId(restoreData.endImageId);
    setEndImageUrl(restoreData.endImageUrl);
    
    // Notify parent that restore is complete
    onRestoreComplete?.();
  }, [restoreData, models, onRestoreComplete, selectedModelId]);

  // Listen for "use-video-prompt" custom event from chat VideoPromptBlock
  useEffect(() => {
    const handleUseVideoPrompt = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt: string }>;
      const { prompt } = customEvent.detail;
      if (prompt) {
        setParams((prev) => ({ ...prev, prompt }));
      }
    };

    window.addEventListener("use-video-prompt", handleUseVideoPrompt);
    return () => {
      window.removeEventListener("use-video-prompt", handleUseVideoPrompt);
    };
  }, []);

  const costEntries = useMemo(
    () =>
      Object.entries(params).filter(
        ([key, value]) =>
          !key.toLowerCase().includes("prompt") &&
          value !== undefined &&
          value !== null &&
          value !== ""
      ),
    [params]
  );

  const costParams = useMemo(
    () => Object.fromEntries(costEntries),
    [costEntries]
  );

  const costParamsKey = useMemo(
    () =>
      JSON.stringify(
        [...costEntries].sort(([a], [b]) => a.localeCompare(b))
      ),
    [costEntries]
  );

  // Fetch cost preview when model or non-prompt params change
  useEffect(() => {
    if (!selectedModelId) {
      setEstimatedCost(null);
      return;
    }

    const fetchCost = async () => {
      setCostLoading(true);
      try {
        const searchParams = new URLSearchParams();
        searchParams.set("modelId", selectedModelId);
        
        // Add all params to the query string (excluding prompts)
        Object.entries(costParams).forEach(([key, value]) => {
          searchParams.set(key, String(value));
        });

        const res = await fetch(`/api/video/cost?${searchParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setEstimatedCost(data.cost);
        } else {
          setEstimatedCost(null);
        }
      } catch (e) {
        console.error("Failed to fetch cost:", e);
        setEstimatedCost(null);
      } finally {
        setCostLoading(false);
      }
    };

    // Debounce the cost fetch
    const timeoutId = setTimeout(fetchCost, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedModelId, costParamsKey]);

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
    // Create local preview and show uploading state
    const localPreview = URL.createObjectURL(file);
    setUploadPreviewUrl(localPreview);
    setUploadingTarget(pickerTarget);
    setPickerOpen(false);

    const result = await uploadImage(file);

    if (result.success) {
      if (pickerTarget === "source") {
        setSourceImageId(result.data.imageId);
        setSourceImageUrl(result.data.imageUrl);
      } else {
        setEndImageId(result.data.imageId);
        setEndImageUrl(result.data.imageUrl);
      }
    } else {
      console.error("Upload error:", result.error);
      setError(t("failedToUploadImage"));
    }

    // Clean up
    URL.revokeObjectURL(localPreview);
    setUploadPreviewUrl(null);
    setUploadingTarget(null);
  };

  const handleGenerate = async () => {
    if (isUploading) {
      setError(tChat("waitForUpload"));
      return;
    }

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
        const errorMessage =
          data.error === "INSUFFICIENT_CREDITS"
            ? tCredits("insufficientCredits")
            : data.error || t("failedToStartGeneration");
        throw new Error(errorMessage);
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
      <Card className="h-full shadow-none">
        <CardBody className="flex items-center justify-center">
          <Spinner />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col shadow-none">
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
                isDisabled={uploadingTarget === "source"}
              >
                {sourceImageId ? tCommon("change") : tCommon("select")}
              </Button>
            </div>
            {sourceImageUrl || uploadingTarget === "source" ? (
              <div className="relative rounded-lg overflow-hidden border border-divider">
                <Image
                  src={uploadingTarget === "source" && uploadPreviewUrl ? uploadPreviewUrl : sourceImageUrl!}
                  alt={t("sourceImageAlt")}
                  classNames={{
                    wrapper: "w-full aspect-video",
                    img: `w-full h-full object-cover ${uploadingTarget === "source" ? "opacity-50" : ""}`,
                  }}
                />
                {uploadingTarget === "source" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Spinner size="lg" color="white" />
                  </div>
                ) : (
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
                )}
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
                  isDisabled={uploadingTarget === "end"}
                >
                  {endImageId ? tCommon("change") : tCommon("select")}
                </Button>
              </div>
              {endImageUrl || uploadingTarget === "end" ? (
                <div className="relative rounded-lg overflow-hidden border border-divider">
                  <Image
                    src={uploadingTarget === "end" && uploadPreviewUrl ? uploadPreviewUrl : endImageUrl!}
                    alt={t("endImageAlt")}
                    classNames={{
                      wrapper: "w-full aspect-video",
                      img: `w-full h-full object-cover ${uploadingTarget === "end" ? "opacity-50" : ""}`,
                    }}
                  />
                  {uploadingTarget === "end" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Spinner size="lg" color="white" />
                    </div>
                  ) : (
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
                  )}
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
                      handleParamChange(
                        param.name,
                        param.options?.find(
                          (option) => String(option) === e.target.value
                        ) ?? e.target.value
                      )
                    }
                    description={param.description}
                    isRequired={param.required}
                  >
                    {param.options.map((opt) => (
                      <SelectItem key={String(opt)}>{String(opt)}</SelectItem>
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
        <CardFooter className="p-0 border-t border-divider shrink-0 safe-area-bottom">
          <div className="w-full flex flex-col gap-2 sm:gap-3 p-3">
            {isUploading && (
              <div className="flex items-center gap-2 text-xs sm:text-sm text-default-500 w-full">
                <Spinner size="sm" />
                <span>{tChat("waitForUpload")}</span>
              </div>
            )}
            {/* Error Message */}
            {error && (
              <div className="text-xs sm:text-sm text-danger bg-danger-50 p-2 sm:p-3 rounded-lg w-full">
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
              isDisabled={!sourceImageId || !params.prompt?.trim() || isUploading}
              onPress={handleGenerate}
            >
              {submitting ? (
                t("starting")
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>{t("generateVideo")}</span>
                  {selectedModelId && !costLoading && estimatedCost !== null ? (
                    <span className="flex items-center gap-1 font-semibold">
                      <Bean size={16} />
                      <span>{estimatedCost.toLocaleString()}</span>
                    </span>
                  ) : null}
                </span>
              )}
            </Button>
          </div>
        </CardFooter>
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
