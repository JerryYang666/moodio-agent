/**
 * Video Model Registry
 *
 * Type-safe registry of supported video generation models with their parameters.
 * Each model defines available options, defaults, and validation rules.
 * The frontend uses this to render dynamic forms, and the backend uses it
 * for the "replace and fill" validation strategy.
 */

export type VideoModelParamType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "string_array";

/**
 * Parameter status controls visibility and behavior:
 * - "active" (default): Normal parameter, displayed and participates in replace and fill
 * - "hidden": Not displayed to user, but still participates in replace and fill (always uses default)
 * - "disabled": Completely ignored - not displayed and not in replace and fill
 */
export type VideoModelParamStatus = "active" | "hidden" | "disabled";

export interface VideoModelParam {
  name: string;
  type: VideoModelParamType;
  required: boolean;
  default?: string | number | boolean | string[];
  options?: Array<string | number>; // For enum types
  description?: string;
  label?: string; // Human-readable label for UI
  min?: number; // For number types
  max?: number; // For number types
  maxItems?: number; // For array types - maximum number of items allowed
  status?: VideoModelParamStatus; // Defaults to "active" if not specified
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
  description:
    "ByteDance's high-quality image-to-video generation model with audio support",
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
      description:
        "Video resolution - 480p for faster generation, 720p for balance, 1080p for higher quality",
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
      description:
        "Random seed to control video generation. Use -1 for random.",
      min: -1,
    },
    {
      name: "enable_safety_checker",
      label: "Safety Checker",
      type: "boolean",
      required: false,
      default: false,
      description:
        "If enabled, the safety checker will filter inappropriate content",
      status: "hidden",
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
 * MiniMax Hailuo 2.3 Fast Pro - Image to Video
 * Advanced fast image-to-video generation model with 1080p resolution
 */
const hailuo23FastPro: VideoModelConfig = {
  id: "fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video",
  name: "Hailuo 2.3 Fast Pro",
  description:
    "MiniMax's fast image-to-video model with 1080p output and prompt optimization",
  imageParams: {
    sourceImage: "image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "Text prompt for video generation",
    },
    {
      name: "prompt_optimizer",
      label: "Prompt Optimizer",
      type: "boolean",
      required: false,
      default: true,
      description: "Whether to use the model's prompt optimizer",
    },
    {
      name: "image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description: "URL of the image to use as the first frame",
    },
  ],
};

/**
 * MiniMax Hailuo 2.3 Pro - Image to Video
 * Advanced image-to-video generation model with 1080p resolution
 */
const hailuo23Pro: VideoModelConfig = {
  id: "fal-ai/minimax/hailuo-2.3/pro/image-to-video",
  name: "Hailuo 2.3 Pro",
  description:
    "MiniMax's high-quality image-to-video model with 1080p output and prompt optimization",
  imageParams: {
    sourceImage: "image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "Text prompt for video generation",
    },
    {
      name: "prompt_optimizer",
      label: "Prompt Optimizer",
      type: "boolean",
      required: false,
      default: true,
      description: "Whether to use the model's prompt optimizer",
    },
    {
      name: "image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description: "URL of the image to use as the first frame",
    },
  ],
};

/**
 * MiniMax Hailuo 02 Pro - Image to Video
 * Advanced image-to-video generation model with 1080p resolution
 */
const hailuo02Pro: VideoModelConfig = {
  id: "fal-ai/minimax/hailuo-02/pro/image-to-video",
  name: "Hailuo 02 Pro",
  description:
    "MiniMax's high-quality image-to-video model with 1080p output and prompt optimization",
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
      description: "Text prompt for video generation",
    },
    {
      name: "image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description: "URL of the image to use as the first frame",
    },
    {
      name: "prompt_optimizer",
      label: "Prompt Optimizer",
      type: "boolean",
      required: false,
      default: true,
      description: "Whether to use the model's prompt optimizer",
    },
    {
      name: "end_image_url",
      label: "End Image",
      type: "string",
      required: false,
      description: "Optional URL of the image to use as the last frame",
    },
  ],
};

/**
 * Wan v2.6 Image to Video
 * High-quality image-to-video generation with support for multi-shot segmentation
 */
const wanV26ImageToVideo: VideoModelConfig = {
  id: "wan/v2.6/image-to-video",
  name: "Wan v2.6",
  description:
    "High-quality image-to-video with up to 15s duration and intelligent multi-shot segmentation",
  imageParams: {
    sourceImage: "image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description:
        "The text prompt describing the desired video motion. Max 800 characters.",
    },
    {
      name: "image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description:
        "URL of the image to use as the first frame. Image dimensions must be between 240 and 7680.",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "1080p",
      options: ["720p", "1080p"],
      description: "Video resolution - 720p for faster generation, 1080p for higher quality",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "5",
      options: ["5", "10", "15"],
      description: "Duration of the generated video in seconds",
    },
    {
      name: "negative_prompt",
      label: "Negative Prompt",
      type: "string",
      required: false,
      default: "",
      description:
        "Negative prompt to describe content to avoid. Max 500 characters.",
    },
    {
      name: "enable_prompt_expansion",
      label: "Prompt Expansion",
      type: "boolean",
      required: false,
      default: true,
      description: "Whether to enable prompt rewriting using LLM for better results",
    },
    {
      name: "multi_shots",
      label: "Multi-Shot Mode",
      type: "boolean",
      required: false,
      default: false,
      description:
        "Enable intelligent multi-shot segmentation. Only active when Prompt Expansion is enabled.",
    },
    {
      name: "seed",
      label: "Seed",
      type: "number",
      required: false,
      description: "Random seed for reproducibility. Leave empty for random.",
    },
    {
      name: "enable_safety_checker",
      label: "Safety Checker",
      type: "boolean",
      required: false,
      default: false,
      description:
        "If enabled, the safety checker will filter inappropriate content",
      status: "hidden",
    },
  ],
};

/**
 * Kling Video v2.6 Pro - Image to Video
 * Top-tier image-to-video with cinematic visuals, fluid motion, and native audio generation
 */
const klingV26Pro: VideoModelConfig = {
  id: "fal-ai/kling-video/v2.6/pro/image-to-video",
  name: "Kling Video v2.6 Pro",
  description:
    "Top-tier image-to-video with cinematic visuals, fluid motion, and native audio generation",
  imageParams: {
    sourceImage: "start_image_url",
    endImage: "end_image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description:
        "The text prompt used to generate the video. Supports speech in quotes for audio generation.",
    },
    {
      name: "start_image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description: "URL of the image to be used for the video (first frame)",
    },
    {
      name: "end_image_url",
      label: "End Image",
      type: "string",
      required: false,
      description:
        "URL of the image to be used for the end of the video (optional)",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "5",
      options: ["5", "10"],
      description: "The duration of the generated video in seconds",
    },
    {
      name: "negative_prompt",
      label: "Negative Prompt",
      type: "string",
      required: false,
      default: "blur, distort, and low quality",
      description: "Text prompt describing what to avoid in the video",
    },
    {
      name: "generate_audio",
      label: "Generate Audio",
      type: "boolean",
      required: false,
      default: true,
      description:
        "Generate native audio for the video. Supports Chinese and English voice output.",
    },
    {
      name: "voice_ids",
      label: "Voice IDs",
      type: "string_array",
      required: false,
      maxItems: 2,
      description:
        "List of voice IDs for voice control. Reference voices in the prompt using <<<voice_1>>>, <<<voice_2>>>. Maximum 2 voices allowed.",
      status: "disabled",
    },
  ],
};

/**
 * Kling O1 Pro - First Frame / Last Frame Image to Video
 * Generate a video by animating the transition between start and end frames
 */
const klingO1Pro: VideoModelConfig = {
  id: "fal-ai/kling-video/o1/image-to-video",
  name: "Kling O1 Pro",
  description:
    "Generate a video by animating the transition between start and end frames",
  imageParams: {
    sourceImage: "start_image_url",
    endImage: "end_image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description:
        "Use @Image1 to reference the start frame, @Image2 to reference the end frame.",
    },
    {
      name: "start_image_url",
      label: "Start Image",
      type: "string",
      required: true,
      description: "Image to use as the first frame of the video",
    },
    {
      name: "end_image_url",
      label: "End Image",
      type: "string",
      required: false,
      description: "Image to use as the last frame of the video",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "5",
      options: ["5", "10"],
      description: "Video duration in seconds",
    },
  ],
};

/**
 * Kling O3 Pro - Image to Video
 * Generate a video by taking a start frame and an end frame, animating the transition
 * between them while following text-driven style and scene guidance.
 */
const klingO3Pro: VideoModelConfig = {
  id: "fal-ai/kling-video/o3/pro/image-to-video",
  name: "Kling O3 Pro",
  description:
    "Generate a video by animating the transition between start and end frames with text-driven style and scene guidance",
  imageParams: {
    sourceImage: "image_url",
    endImage: "end_image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: false,
      description:
        "Text prompt for video generation describing the desired motion and style",
    },
    {
      name: "image_url",
      label: "Start Image",
      type: "string",
      required: true,
      description: "URL of the start frame image",
    },
    {
      name: "end_image_url",
      label: "End Image",
      type: "string",
      required: false,
      description: "URL of the end frame image (optional)",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "5",
      options: [
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14",
        "15",
      ],
      description: "Video duration in seconds (3-15s)",
    },
    {
      name: "generate_audio",
      label: "Generate Audio",
      type: "boolean",
      required: false,
      default: false,
      description: "Whether to generate native audio for the video",
    },
  ],
};

/**
 * Kling Video v3 Pro - Image to Video
 * Top-tier image-to-video with cinematic visuals, fluid motion, and native audio generation,
 * with custom element support.
 */
const klingV3Pro: VideoModelConfig = {
  id: "fal-ai/kling-video/v3/pro/image-to-video",
  name: "Kling Video v3 Pro",
  description:
    "Top-tier image-to-video with cinematic visuals, fluid motion, native audio generation, and custom element support",
  imageParams: {
    sourceImage: "start_image_url",
    endImage: "end_image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: false,
      description:
        "Text prompt for video generation. Supports speech in quotes for audio generation.",
    },
    {
      name: "start_image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description: "URL of the image to be used for the video (first frame)",
    },
    {
      name: "end_image_url",
      label: "End Image",
      type: "string",
      required: false,
      description: "URL of the image to be used for the end of the video",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "5",
      options: [
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14",
        "15",
      ],
      description: "The duration of the generated video in seconds (3-15s)",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["16:9", "9:16", "1:1"],
      description: "The aspect ratio of the generated video frame",
    },
    {
      name: "negative_prompt",
      label: "Negative Prompt",
      type: "string",
      required: false,
      default: "blur, distort, and low quality",
      description: "Text prompt describing what to avoid in the video",
    },
    {
      name: "cfg_scale",
      label: "CFG Scale",
      type: "number",
      required: false,
      default: 0.5,
      min: 0,
      max: 1,
      description:
        "Classifier Free Guidance scale - how closely to follow the prompt (0-1)",
    },
    {
      name: "generate_audio",
      label: "Generate Audio",
      type: "boolean",
      required: false,
      default: true,
      description:
        "Generate native audio for the video. Supports Chinese and English voice output.",
    },
  ],
};

/**
 * Veo 3.1 - Image to Video
 * Google's state-of-the-art image-to-video generation model
 */
const veo31: VideoModelConfig = {
  id: "fal-ai/veo3.1/image-to-video",
  name: "Veo 3.1",
  description:
    "Google DeepMind's state-of-the-art image-to-video model with optional audio generation",
  imageParams: {
    sourceImage: "image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video to generate",
    },
    {
      name: "image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description:
        "URL of the image to animate (720p+ in 16:9 or 9:16 will work best)",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "auto",
      options: ["auto", "16:9", "9:16"],
      description: "Aspect ratio of the generated video",
    },
    {
      name: "duration",
      label: "Duration",
      type: "enum",
      required: false,
      default: "8s",
      options: ["4s", "6s", "8s"],
      description: "Length of the generated video",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "720p",
      options: ["720p", "1080p", "4k"],
      description: "Output video resolution",
    },
    {
      name: "negative_prompt",
      label: "Negative Prompt",
      type: "string",
      required: false,
      description: "Text prompt describing content to avoid",
    },
    {
      name: "generate_audio",
      label: "Generate Audio",
      type: "boolean",
      required: false,
      default: true,
      description: "Whether to generate audio along with the video",
    },
    {
      name: "seed",
      label: "Seed",
      type: "number",
      required: false,
      description: "Random seed for reproducible results",
    },
    {
      name: "auto_fix",
      label: "Auto Fix",
      type: "boolean",
      required: false,
      default: false,
      description:
        "Whether to auto-rewrite prompts that fail content or validation checks",
    },
  ],
};

/**
 * Veo 3.1 - First-Last-Frame to Video
 * Google's state-of-the-art video generation from first and last frames
 */
const veo31FirstLastFrame: VideoModelConfig = {
  id: "fal-ai/veo3.1/first-last-frame-to-video",
  name: "Veo 3.1 First-Last-Frame",
  description:
    "Google DeepMind's video generation from first and last frames with optional audio",
  imageParams: {
    sourceImage: "first_frame_url",
    endImage: "last_frame_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video you want to generate",
    },
    {
      name: "first_frame_url",
      label: "First Frame",
      type: "string",
      required: true,
      description: "URL of the first frame of the video",
    },
    {
      name: "last_frame_url",
      label: "Last Frame",
      type: "string",
      required: true,
      description: "URL of the last frame of the video",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "auto",
      options: ["auto", "16:9", "9:16"],
      description: "Aspect ratio of the generated video",
    },
    {
      name: "duration",
      label: "Duration",
      type: "enum",
      required: false,
      default: "8s",
      options: ["4s", "6s", "8s"],
      description: "Length of the generated video",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "720p",
      options: ["720p", "1080p", "4k"],
      description: "Output video resolution",
    },
    {
      name: "negative_prompt",
      label: "Negative Prompt",
      type: "string",
      required: false,
      description: "A negative prompt to guide the video generation",
    },
    {
      name: "generate_audio",
      label: "Generate Audio",
      type: "boolean",
      required: false,
      default: true,
      description: "Whether to generate audio for the video",
    },
    {
      name: "seed",
      label: "Seed",
      type: "number",
      required: false,
      description: "Random seed for reproducible results",
    },
    {
      name: "auto_fix",
      label: "Auto Fix",
      type: "boolean",
      required: false,
      default: false,
      description:
        "Whether to auto-rewrite prompts that fail content policy or validation checks",
    },
  ],
};

/**
 * Sora 2 Pro - Image to Video
 * OpenAI's state-of-the-art image-to-video model with audio
 */
const sora2Pro: VideoModelConfig = {
  id: "fal-ai/sora-2/image-to-video/pro",
  name: "Sora 2 Pro",
  description:
    "OpenAI's state-of-the-art image-to-video model capable of detailed clips with audio",
  imageParams: {
    sourceImage: "image_url",
  },
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video to generate",
    },
    {
      name: "image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description: "The URL of the image to use as the first frame",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "auto",
      options: ["auto", "720p", "1080p"],
      description: "Output video resolution",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "auto",
      options: ["auto", "9:16", "16:9"],
      description: "Aspect ratio of the generated video",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: 4,
      options: [4, 8, 12],
      description: "Duration of the generated video in seconds",
    },
    {
      name: "delete_video",
      label: "Delete Video",
      type: "boolean",
      required: false,
      default: true,
      description:
        "Whether to delete the video after generation for privacy reasons",
      status: "hidden",
    },
  ],
};

/**
 * Registry of all supported video models
 */
export const VIDEO_MODELS: VideoModelConfig[] = [
  seedanceV15Pro,
  hailuo23FastPro,
  hailuo23Pro,
  hailuo02Pro,
  wanV26ImageToVideo,
  klingV26Pro,
  klingO1Pro,
  klingO3Pro,
  klingV3Pro,
  veo31,
  veo31FirstLastFrame,
  sora2Pro,
];

/**
 * Default model ID
 */
export const DEFAULT_VIDEO_MODEL_ID =
  "fal-ai/bytedance/seedance/v1.5/pro/image-to-video";

/**
 * Get a video model config by ID
 */
export function getVideoModel(modelId: string): VideoModelConfig | undefined {
  return VIDEO_MODELS.find((m) => m.id === modelId);
}

/**
 * Get the default values for a model's parameters
 * Skips disabled parameters as they don't participate in replace and fill
 */
export function getModelDefaults(modelId: string): Record<string, any> {
  const model = getVideoModel(modelId);
  if (!model) return {};

  const defaults: Record<string, any> = {};
  for (const param of model.params) {
    // Skip disabled parameters - they don't participate in replace and fill
    if (param.status === "disabled") continue;

    if (param.default !== undefined) {
      defaults[param.name] = param.default;
    }
  }
  return defaults;
}

/**
 * Validate and merge user input with model defaults (replace and fill strategy)
 * Returns the merged params or throws an error if validation fails
 *
 * Status handling:
 * - "disabled": Parameter is completely skipped (not in output)
 * - "hidden": User input is ignored, always uses default value
 * - "active" (default): Normal validation and merge
 */
export function validateAndMergeParams(
  modelId: string,
  userParams: Record<string, any>
): Record<string, any> {
  const model = getVideoModel(modelId);
  if (!model) {
    throw new Error(`Unknown video model: ${modelId}`);
  }

  // Start with defaults (already excludes disabled params)
  const merged = getModelDefaults(modelId);

  // Validate and merge user params
  for (const param of model.params) {
    // Skip disabled parameters entirely
    if (param.status === "disabled") continue;

    // For hidden parameters, ignore user input and always use default
    if (param.status === "hidden") continue;

    const userValue = userParams[param.name];

    // Check required params
    if (
      param.required &&
      userValue === undefined &&
      merged[param.name] === undefined
    ) {
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
        const numValue =
          typeof userValue === "string" ? parseFloat(userValue) : userValue;
        if (typeof numValue !== "number" || isNaN(numValue)) {
          throw new Error(`Parameter ${param.name} must be a number`);
        }
        if (param.min !== undefined && numValue < param.min) {
          throw new Error(
            `Parameter ${param.name} must be at least ${param.min}`
          );
        }
        if (param.max !== undefined && numValue > param.max) {
          throw new Error(
            `Parameter ${param.name} must be at most ${param.max}`
          );
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
        if (
          !param.options?.some(
            (option) => String(option) === String(userValue)
          )
        ) {
          throw new Error(
            `Parameter ${param.name} must be one of: ${param.options?.join(", ")}`
          );
        }
        {
          const matchedOption = param.options?.find(
            (option) => String(option) === String(userValue)
          );
          if (matchedOption !== undefined) {
            merged[param.name] = matchedOption;
            continue;
          }
        }
        break;

      case "string_array":
        if (!Array.isArray(userValue)) {
          throw new Error(
            `Parameter ${param.name} must be an array of strings`
          );
        }
        for (const item of userValue) {
          if (typeof item !== "string") {
            throw new Error(
              `Parameter ${param.name} must contain only strings`
            );
          }
        }
        if (param.maxItems !== undefined && userValue.length > param.maxItems) {
          throw new Error(
            `Parameter ${param.name} allows maximum ${param.maxItems} items`
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
 * Excludes hidden and disabled parameters as they shouldn't be shown to users
 */
export function getModelConfigForApi(modelId: string) {
  const model = getVideoModel(modelId);
  if (!model) return null;

  return {
    id: model.id,
    name: model.name,
    description: model.description,
    imageParams: model.imageParams,
    params: model.params
      // Filter out hidden and disabled params - they shouldn't be exposed to frontend
      .filter((p) => !p.status || p.status === "active")
      .map((p) => ({
        name: p.name,
        label: p.label || p.name,
        type: p.type,
        required: p.required,
        default: p.default,
        options: p.options,
        description: p.description,
        min: p.min,
        max: p.max,
        maxItems: p.maxItems,
      })),
  };
}

/**
 * Get all models for API response
 */
export function getAllModelsForApi() {
  return VIDEO_MODELS.map((m) => getModelConfigForApi(m.id));
}
