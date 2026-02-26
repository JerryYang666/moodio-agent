export type ImageModelProvider = "google" | "fal";

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

/**
 * Nano-banana Pro (Gemini image) - Image generation + editing
 */
const nanoBananaPro: ImageModelConfig = {
  id: "nano-banana-pro",
  name: "Nano-banana Pro",
  description: "Gemini image model for text-to-image and image editing",
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

export const IMAGE_MODELS: ImageModelConfig[] = [nanoBananaPro, seedreamV45];

export const DEFAULT_IMAGE_MODEL_ID = nanoBananaPro.id;

export function getImageModel(modelId: string): ImageModelConfig | undefined {
  return IMAGE_MODELS.find((model) => model.id === modelId);
}
