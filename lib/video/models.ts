/**
 * Video Model Registry
 *
 * Type-safe registry of supported video generation models with their parameters.
 * Each model defines available options, defaults, and validation rules.
 * The frontend uses this to render dynamic forms, and the backend uses it
 * for the "replace and fill" validation strategy.
 */

export type VideoModelParamType = "string" | "number" | "boolean" | "enum";

export interface VideoModelParam {
  name: string;
  type: VideoModelParamType;
  required: boolean;
  default?: string | number | boolean;
  options?: string[]; // For enum types
  description?: string;
  label?: string; // Human-readable label for UI
  min?: number; // For number types
  max?: number; // For number types
}

export interface VideoModelConfig {
  id: string;
  name: string;
  description?: string;
  params: VideoModelParam[];
  // Which params are for images (special handling with asset picker)
  imageParams: {
    sourceImage: string; // Required source image param name
    endImage?: string; // Optional end image param name
  };
}

/**
 * Seedance v1.5 Pro - Image to Video
 * ByteDance's video generation model
 */
const seedanceV15Pro: VideoModelConfig = {
  id: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
  name: "Seedance v1.5 Pro",
  description: "ByteDance's high-quality image-to-video generation model with audio support",
  imageParams: {
    sourceImage: "image_url",
    endImage: "end_image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt used to generate the video",
    },
    {
      name: "image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description: "The URL of the image used to generate video (first frame)",
    },
    {
      name: "end_image_url",
      label: "End Image",
      type: "string",
      required: false,
      description: "The URL of the image the video ends with (optional)",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
      description: "The aspect ratio of the generated video",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "720p",
      options: ["480p", "720p", "1080p"],
      description: "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "5",
      options: ["4", "5", "6", "7", "8", "9", "10", "11", "12"],
      description: "Duration of the video in seconds",
    },
    {
      name: "camera_fixed",
      label: "Fixed Camera",
      type: "boolean",
      required: false,
      default: false,
      description: "Whether to fix the camera position",
    },
    {
      name: "seed",
      label: "Seed",
      type: "number",
      required: false,
      description: "Random seed to control video generation. Use -1 for random.",
      min: -1,
    },
    {
      name: "enable_safety_checker",
      label: "Safety Checker",
      type: "boolean",
      required: false,
      default: true,
      description: "If enabled, the safety checker will filter inappropriate content",
    },
    {
      name: "generate_audio",
      label: "Generate Audio",
      type: "boolean",
      required: false,
      default: true,
      description: "Whether to generate audio for the video",
    },
  ],
};

/**
 * Registry of all supported video models
 */
export const VIDEO_MODELS: VideoModelConfig[] = [seedanceV15Pro];

/**
 * Default model ID
 */
export const DEFAULT_VIDEO_MODEL_ID = "fal-ai/bytedance/seedance/v1.5/pro/image-to-video";

/**
 * Get a video model config by ID
 */
export function getVideoModel(modelId: string): VideoModelConfig | undefined {
  return VIDEO_MODELS.find((m) => m.id === modelId);
}

/**
 * Get the default values for a model's parameters
 */
export function getModelDefaults(modelId: string): Record<string, any> {
  const model = getVideoModel(modelId);
  if (!model) return {};

  const defaults: Record<string, any> = {};
  for (const param of model.params) {
    if (param.default !== undefined) {
      defaults[param.name] = param.default;
    }
  }
  return defaults;
}

/**
 * Validate and merge user input with model defaults (replace and fill strategy)
 * Returns the merged params or throws an error if validation fails
 */
export function validateAndMergeParams(
  modelId: string,
  userParams: Record<string, any>
): Record<string, any> {
  const model = getVideoModel(modelId);
  if (!model) {
    throw new Error(`Unknown video model: ${modelId}`);
  }

  // Start with defaults
  const merged = getModelDefaults(modelId);

  // Validate and merge user params
  for (const param of model.params) {
    const userValue = userParams[param.name];

    // Check required params
    if (param.required && userValue === undefined && merged[param.name] === undefined) {
      throw new Error(`Missing required parameter: ${param.name}`);
    }

    // Skip if user didn't provide this param
    if (userValue === undefined) continue;

    // Type validation
    switch (param.type) {
      case "string":
        if (typeof userValue !== "string") {
          throw new Error(`Parameter ${param.name} must be a string`);
        }
        break;

      case "number":
        const numValue = typeof userValue === "string" ? parseFloat(userValue) : userValue;
        if (typeof numValue !== "number" || isNaN(numValue)) {
          throw new Error(`Parameter ${param.name} must be a number`);
        }
        if (param.min !== undefined && numValue < param.min) {
          throw new Error(`Parameter ${param.name} must be at least ${param.min}`);
        }
        if (param.max !== undefined && numValue > param.max) {
          throw new Error(`Parameter ${param.name} must be at most ${param.max}`);
        }
        merged[param.name] = numValue;
        continue;

      case "boolean":
        if (typeof userValue !== "boolean") {
          // Accept string "true"/"false"
          if (userValue === "true") {
            merged[param.name] = true;
            continue;
          } else if (userValue === "false") {
            merged[param.name] = false;
            continue;
          }
          throw new Error(`Parameter ${param.name} must be a boolean`);
        }
        break;

      case "enum":
        if (!param.options?.includes(String(userValue))) {
          throw new Error(
            `Parameter ${param.name} must be one of: ${param.options?.join(", ")}`
          );
        }
        break;
    }

    // Override default with user value
    merged[param.name] = userValue;
  }

  return merged;
}

/**
 * Get model config for API response (safe for frontend)
 */
export function getModelConfigForApi(modelId: string) {
  const model = getVideoModel(modelId);
  if (!model) return null;

  return {
    id: model.id,
    name: model.name,
    description: model.description,
    imageParams: model.imageParams,
    params: model.params.map((p) => ({
      name: p.name,
      label: p.label || p.name,
      type: p.type,
      required: p.required,
      default: p.default,
      options: p.options,
      description: p.description,
      min: p.min,
      max: p.max,
    })),
  };
}

/**
 * Get all models for API response
 */
export function getAllModelsForApi() {
  return VIDEO_MODELS.map((m) => getModelConfigForApi(m.id));
}
