"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { Switch } from "@heroui/switch";
import { ChevronUp } from "lucide-react";
import type {
  VideoModelConfig,
  VideoModelParam,
} from "@/lib/video/models";

// localStorage key prefix for model parameters (shared with storyboard)
const STORAGE_KEY_PREFIX = "video-model-params-";

const getStorageKey = (modelId: string) => `${STORAGE_KEY_PREFIX}${modelId}`;

const saveModelParams = (modelId: string, params: Record<string, any>) => {
  if (typeof window === "undefined") return;
  const paramsToSave: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (
      key === "prompt" ||
      key.includes("image") ||
      key.includes("url") ||
      value === undefined ||
      value === null ||
      value === ""
    )
      continue;
    paramsToSave[key] = value;
  }
  try {
    localStorage.setItem(getStorageKey(modelId), JSON.stringify(paramsToSave));
  } catch (e) {
    console.warn("Failed to save model params to localStorage:", e);
  }
};

const loadModelParams = (modelId: string): Record<string, any> | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(getStorageKey(modelId));
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.warn("Failed to load model params from localStorage:", e);
  }
  return null;
};

interface VideoModeParamsProps {
  videoModelId: string;
  videoParams: Record<string, any>;
  onModelChange: (modelId: string) => void;
  onParamsChange: (params: Record<string, any>) => void;
}

export default function VideoModeParams({
  videoModelId,
  videoParams,
  onModelChange,
  onParamsChange,
}: VideoModeParamsProps) {
  const t = useTranslations("video");
  const [models, setModels] = useState<VideoModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch("/api/video/models");
        if (!res.ok) throw new Error("Failed to load video models");
        const data = await res.json();
        setModels(data.models);
        setDefaultModelId(data.defaultModelId);

        // If no model selected yet, use default
        if (!videoModelId) {
          onModelChange(data.defaultModelId);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadModels();
  }, []);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === videoModelId),
    [models, videoModelId]
  );

  // Initialize params when model changes
  useEffect(() => {
    if (!videoModelId || models.length === 0) return;
    const model = models.find((m) => m.id === videoModelId);
    if (!model) return;

    const initialParams: Record<string, any> = {};
    for (const param of model.params) {
      if (
        param.name === model.imageParams.sourceImage ||
        param.name === model.imageParams.endImage ||
        param.name === "prompt" ||
        param.status === "hidden" ||
        param.status === "disabled"
      )
        continue;
      if (param.default !== undefined) {
        initialParams[param.name] = param.default;
      }
    }

    // Merge with saved localStorage params
    const savedParams = loadModelParams(videoModelId);
    if (savedParams) {
      for (const [key, value] of Object.entries(savedParams)) {
        const paramExists = model.params.some((p) => p.name === key);
        if (paramExists && value !== undefined && value !== null) {
          initialParams[key] = value;
        }
      }
    }

    onParamsChange(initialParams);
  }, [videoModelId, models]);

  // Save params to localStorage when they change
  useEffect(() => {
    if (!videoModelId || Object.keys(videoParams).length === 0) return;
    const timeoutId = setTimeout(() => {
      saveModelParams(videoModelId, videoParams);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [videoModelId, videoParams]);

  const handleParamChange = useCallback(
    (name: string, value: any) => {
      onParamsChange({ ...videoParams, [name]: value });
    },
    [videoParams, onParamsChange]
  );

  // Get visible params (filter out prompt, image params, hidden, disabled)
  const visibleParams = useMemo(() => {
    if (!selectedModel) return [];
    return selectedModel.params.filter(
      (p) =>
        p.name !== "prompt" &&
        p.name !== selectedModel.imageParams.sourceImage &&
        p.name !== selectedModel.imageParams.endImage &&
        p.status !== "hidden" &&
        p.status !== "disabled"
    );
  }, [selectedModel]);

  if (loading) {
    return (
      <div className="flex items-center mt-4">
        <span className="text-xs text-default-400">Loading...</span>
      </div>
    );
  }

  const renderParamControl = (param: VideoModelParam) => {
    const value = videoParams[param.name] ?? param.default ?? "";

    if (param.type === "enum" && param.options) {
      return (
        <div key={param.name} className="flex flex-col gap-0.5">
          <span className="text-[10px] text-default-400 uppercase tracking-wide pl-1">
            {param.label || param.name}
          </span>
          <Dropdown>
            <DropdownTrigger>
              <Button
                className="capitalize"
                variant="bordered"
                size="sm"
                endContent={<ChevronUp size={14} className="text-default-400" />}
              >
                {String(value)}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label={param.label || param.name}
              selectedKeys={value ? new Set([String(value)]) : new Set()}
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
        </div>
      );
    }

    if (param.type === "boolean") {
      return (
        <div key={param.name} className="flex flex-col gap-0.5">
          <span className="text-[10px] text-default-400 uppercase tracking-wide pl-1">
            {param.label || param.name}
          </span>
          <div className="flex items-center h-8">
            <Switch
              size="sm"
              isSelected={Boolean(value)}
              onValueChange={(v) => handleParamChange(param.name, v)}
            />
          </div>
        </div>
      );
    }

    if (param.type === "number") {
      const hasFiniteRange =
        param.min !== undefined &&
        param.max !== undefined &&
        param.max - param.min <= 20;

      if (hasFiniteRange) {
        const min = param.min!;
        const max = param.max!;
        const step = max - min <= 1 ? 0.1 : 1;
        const items: { key: string; label: string }[] = [];
        for (let i = min; i <= max + Number.EPSILON; i = Math.round((i + step) * 10) / 10) {
          const label = step < 1 ? i.toFixed(1) : String(i);
          items.push({ key: label, label });
        }
        return (
          <div key={param.name} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-default-400 uppercase tracking-wide pl-1">
              {param.label || param.name}
            </span>
            <Dropdown>
              <DropdownTrigger>
                <Button
                  className="capitalize"
                  variant="bordered"
                  size="sm"
                  endContent={<ChevronUp size={14} className="text-default-400" />}
                >
                  {String(value)}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                disallowEmptySelection
                aria-label={param.label || param.name}
                selectedKeys={value !== "" ? new Set([String(value)]) : new Set()}
                selectionMode="single"
                variant="flat"
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  if (selected) {
                    handleParamChange(param.name, Number(selected));
                  }
                }}
              >
                {items.map((item) => (
                  <DropdownItem key={item.key}>{item.label}</DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
          </div>
        );
      }

      return (
        <div key={param.name} className="flex flex-col gap-0.5">
          <span className="text-[10px] text-default-400 uppercase tracking-wide pl-1">
            {param.label || param.name}
          </span>
          <input
            type="number"
            className="h-8 w-24 rounded-lg border border-default-200 bg-transparent px-2 text-sm outline-none focus:border-primary"
            value={value === "" || value === undefined ? "" : value}
            min={param.min}
            max={param.max}
            placeholder={param.description ? String(param.min ?? "") : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "" || raw === "-") {
                handleParamChange(param.name, raw === "-" ? raw : undefined);
                return;
              }
              const num = Number(raw);
              if (!isNaN(num)) {
                handleParamChange(param.name, num);
              }
            }}
          />
        </div>
      );
    }

    // Skip string_array in compact param bar (too complex for inline display)
    return null;
  };

  return (
    <>
      {/* Video Model Selector */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-default-400 uppercase tracking-wide pl-1">
          {t("model")}
        </span>
        <Dropdown>
          <DropdownTrigger>
            <Button
              className="capitalize"
              variant="bordered"
              size="sm"
              endContent={<ChevronUp size={14} className="text-default-400" />}
            >
              {selectedModel?.name || "Select Model"}
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            disallowEmptySelection
            aria-label="Select video model"
            selectedKeys={videoModelId ? new Set([videoModelId]) : new Set()}
            selectionMode="single"
            variant="flat"
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected && selected !== videoModelId) {
                onModelChange(selected);
              }
            }}
          >
            {models.map((model) => (
              <DropdownItem key={model.id} description={model.description}>
                {model.name}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </div>

      {/* Dynamic Params */}
      {visibleParams.map((param) => renderParamControl(param))}
    </>
  );
}
