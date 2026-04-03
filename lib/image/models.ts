export type ImageModelProvider = "google" | "fal" | "kie";

export type ImageModelPricingParamType = "string" | "number" | "boolean" | "enum";

export interface ImageModelPricingParam {
  name: string;
  type: ImageModelPricingParamType;
  options?: (string | number)[];
  default?: string | number | boolean;
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

export const IMAGE_MODELS: ImageModelConfig[] = [nanoBanana2, nanoBanana2Fast, seedreamV45];

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
    })),
  };
}
