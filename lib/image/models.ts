export type ImageModelProvider = "google" | "fal" | "kie" | "openai";

export type ImageModelPricingParamType = "string" | "number" | "boolean" | "enum";

export interface ImageModelPricingParam {
  name: string;
  type: ImageModelPricingParamType;
  options?: (string | number)[];
  default?: string | number | boolean;
  description?: string;
}

export interface ImageModelConfig {
  id: string;
  name: string;
  description?: string;
  provider: ImageModelProvider;
  supports: {
    generate: boolean;
    edit: boolean;
  };
  providerModelIds: {
    generate?: string;
    edit?: string;
  };
}

const IMAGE_PRICING_PARAMS: ImageModelPricingParam[] = [
  { name: "resolution", type: "enum", options: [1, 2, 4], default: 2 },
  {
    name: "quality",
    type: "enum",
    options: [1, 2, 3],
    default: 2,
    description:
      "Only respected by gpt-image-2 (1=low, 2=medium/auto, 3=high). Other image models ignore this param.",
  },
];

/**
 * Nano Banana 2 - Image generation + editing via KIE
 */
const nanoBanana2: ImageModelConfig = {
  id: "nano-banana-2",
  name: "Nano Banana 2",
  description: "Google Nano Banana 2 via KIE for text-to-image and image editing",
  provider: "kie",
  supports: {
    generate: true,
    edit: true,
  },
  providerModelIds: {
    generate: "nano-banana-2",
    edit: "nano-banana-2",
    // Google direct (for future fallback): "gemini-3.1-flash-image-preview"
  },
};

/**
 * Nano Banana Pro - Image generation + editing via KIE
 */
const nanoBananaPro: ImageModelConfig = {
  id: "nano-banana-pro",
  name: "Nano Banana Pro",
  description: "Google Nano Banana Pro via KIE for text-to-image and image editing",
  provider: "kie",
  supports: {
    generate: true,
    edit: true,
  },
  providerModelIds: {
    generate: "nano-banana-pro",
    edit: "nano-banana-pro",
  },
};

/**
 * Nano Banana 2 Fast - Image generation + editing via Google Gemini direct
 */
const nanoBanana2Fast: ImageModelConfig = {
  id: "nano-banana-2-fast",
  name: "Nano Banana 2 Fast",
  description: "Google Nano Banana 2 via Gemini direct for fast text-to-image and image editing",
  provider: "google",
  supports: {
    generate: true,
    edit: true,
  },
  providerModelIds: {
    generate: "gemini-3.1-flash-image-preview",
    edit: "gemini-3.1-flash-image-preview",
  },
};

/**
 * Nano Banana Pro Fast - Image generation + editing via Google Gemini direct (Pro preview)
 */
const nanoBananaProFast: ImageModelConfig = {
  id: "nano-banana-pro-fast",
  name: "Nano Banana Pro Fast",
  description: "Google Nano Banana Pro via Gemini direct for text-to-image and image editing",
  provider: "google",
  supports: {
    generate: true,
    edit: true,
  },
  providerModelIds: {
    generate: "gemini-3-pro-image-preview",
    edit: "gemini-3-pro-image-preview",
  },
};

/**
 * ByteDance Seedream v4.5 - Image generation + editing (Fal)
 */
const seedreamV45: ImageModelConfig = {
  id: "seedream-45",
  name: "Seedream 4.5",
  description:
    "ByteDance Seedream 4.5 for text-to-image and image editing via Fal",
  provider: "fal",
  supports: {
    generate: true,
    edit: true,
  },
  providerModelIds: {
    generate: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    edit: "fal-ai/bytedance/seedream/v4.5/edit",
  },
};

/**
 * Qwen Image Edit 2511 - Multiple Angles edit-only model (Fal).
 *
 * Not exposed in the model picker; dispatched internally by the "angles"
 * image-edit operation.
 */
const qwenImageEditAngles: ImageModelConfig = {
  id: "qwen-image-edit-angles",
  name: "Qwen Image Edit – Angles",
  description:
    "Qwen Image Edit 2511 Multiple Angles via Fal — re-renders an image from a different camera angle",
  provider: "fal",
  supports: {
    generate: false,
    edit: true,
  },
  providerModelIds: {
    edit: "fal-ai/qwen-image-edit-2511-multiple-angles",
  },
};

/**
 * OpenAI GPT Image 2 - Image generation + editing via OpenAI Images API
 */
const gptImage2: ImageModelConfig = {
  id: "gpt-image-2",
  name: "GPT Image 2",
  description:
    "OpenAI GPT Image 2 for high-quality text-to-image and image editing. Supports quality tiers (low/medium/high/auto).",
  provider: "openai",
  supports: {
    generate: true,
    edit: true,
  },
  providerModelIds: {
    generate: "gpt-image-2",
    edit: "gpt-image-2",
  },
};

export const IMAGE_MODELS: ImageModelConfig[] = [
  nanoBanana2,
  nanoBanana2Fast,
  nanoBananaPro,
  nanoBananaProFast,
  seedreamV45,
  gptImage2,
  qwenImageEditAngles,
];

export const DEFAULT_IMAGE_MODEL_ID = nanoBanana2.id;

export function getImageModel(modelId: string): ImageModelConfig | undefined {
  return IMAGE_MODELS.find((model) => model.id === modelId);
}

export const IMAGE_MODEL_IDS = new Set(IMAGE_MODELS.map((m) => m.id));

export function getImageModelConfigForApi(modelId: string) {
  const model = getImageModel(modelId);
  if (!model) return null;

  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    params: IMAGE_PRICING_PARAMS.map((p) => ({
      name: p.name,
      type: p.type,
      options: p.options,
      default: p.default,
      description: p.description,
    })),
  };
}
