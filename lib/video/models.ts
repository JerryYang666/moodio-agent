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
  | "string_array"
  | "asset"
  | "multi_prompt"
  | "kling_elements"
  | "media_references";

export interface MultiPromptShot {
  prompt: string;
  duration: number;
}

export interface KlingElement {
  name: string;
  description: string;
  element_input_ids: string[];
}

export interface MediaReference {
  type: "image" | "video" | "audio";
  id: string;
  pinned?: boolean;
}

export type AssetAcceptType = "image" | "video";

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
  maxLength?: number; // For string types - maximum character length
  status?: VideoModelParamStatus; // Defaults to "active" if not specified
  acceptTypes?: AssetAcceptType[]; // For "asset" type - which asset types the picker allows
}

export type VideoProvider = "fal" | "kie" | "volcengine";

/**
 * Per-provider overrides for a single parameter.
 * Only include fields that differ from the base model definition.
 */
export interface ParamOverride {
  options?: Array<string | number>;
  min?: number;
  max?: number;
  maxLength?: number;
  default?: string | number | boolean | string[];
  status?: VideoModelParamStatus;
}

export interface ProviderVariant {
  provider: VideoProvider;
  providerModelId: string;
  paramMapping?: Record<string, string>;
  paramOverrides?: Record<string, ParamOverride>;
}

export interface VideoModelConfig {
  id: string;
  name: string;
  description?: string;
  params: VideoModelParam[];
  imageParams?: {
    sourceImage: string;
    endImage?: string;
  };
  providers: ProviderVariant[];
}

/**
 * Placeholder image ID used for text-to-video models.
 * Points to a real image in S3 at images/text-to-video-placeholder.
 */
export const TEXT_TO_VIDEO_PLACEHOLDER_IMAGE_ID = "text-to-video-placeholder";

/**
 * Seedance v1.5 Pro - Image to Video
 * ByteDance's video generation model
 */
const seedanceV15Pro: VideoModelConfig = {
  id: "seedance-v1.5-pro",
  name: "Seedance v1.5 Pro",
  description:
    "ByteDance's high-quality image-to-video generation model with audio support",
  imageParams: {
    sourceImage: "image_url",
    endImage: "end_image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video" },
    { provider: "kie", providerModelId: "PLACEHOLDER_kie_seedance_v15_pro" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt used to generate the video",
      maxLength: 2500,
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
 * Seedance 2.0 - First/Last Frame Image to Video
 * ByteDance's next-gen video generation with optional first and last frame control
 */
const seedance20: VideoModelConfig = {
  id: "seedance-2.0",
  name: "Seedance 2.0",
  description:
    "ByteDance's next-gen video generation with first/last frame control, text-to-video support, and native audio",
  imageParams: {
    sourceImage: "first_frame_url",
    endImage: "last_frame_url",
  },
  providers: [
    { provider: "kie", providerModelId: "bytedance/seedance-2" },
    {
      provider: "fal",
      providerModelId: "bytedance/seedance-2.0",
      paramMapping: { first_frame_url: "image_url", last_frame_url: "end_image_url" },
    },
    { provider: "volcengine", providerModelId: "doubao-seedance-2-0-260128" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "Text prompt for video generation (3-2500 characters)",
      maxLength: 2500,
    },
    {
      name: "first_frame_url",
      label: "First Frame",
      type: "string",
      required: false,
      description: "URL of the first frame image (optional — omit for text-to-video)",
    },
    {
      name: "last_frame_url",
      label: "Last Frame",
      type: "string",
      required: false,
      description: "URL of the last frame image (optional)",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "8",
      options: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "15"],
      description: "Duration of the generated video in seconds",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"],
      description: "Video aspect ratio (adaptive matches input image)",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "720p",
      options: ["480p", "720p", "1080p"],
      description:
        "Video resolution — 480p for faster generation, 720p for balance, 1080p for higher quality",
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
      name: "web_search",
      label: "Web Search",
      type: "boolean",
      required: false,
      default: false,
      description: "Use online search to enhance generation",
      status: "hidden",
    },
  ],
};

/**
 * Seedance 2.0 Reference - Multimodal Reference to Video
 * Reference images and videos to guide generation, mentionable via @image1 / @video1
 */
const seedance20Reference: VideoModelConfig = {
  id: "seedance-2.0-reference",
  name: "Seedance 2.0 Reference",
  description:
    "Multimodal reference-to-video: attach images, videos, and audio as named references (@image1, @video1, @audio1) to guide generation",
  providers: [
    { provider: "kie", providerModelId: "bytedance/seedance-2" },
    { provider: "fal", providerModelId: "bytedance/seedance-2.0" },
    { provider: "volcengine", providerModelId: "doubao-seedance-2-0-260128" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description:
        "Text prompt for video generation. Use @image1, @video1, @audio1, etc. to reference attached media (3-2500 characters)",
      maxLength: 2500,
    },
    {
      name: "media_references",
      label: "Media References",
      type: "media_references",
      required: false,
      maxItems: 12,
      description:
        "Attach reference images (max 9), videos (max 3, combined max 15s), and audio files (max 3, MP3/WAV, combined max 15s). Each gets auto-named @image1/@video1/@audio1 etc.",
    },
    {
      name: "reference_video_duration",
      label: "Reference Video Duration",
      type: "number",
      required: false,
      default: 0,
      min: 0,
      max: 15,
      description: "Combined duration in seconds of all reference videos (0 if none)",
      status: "hidden",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "8",
      options: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "15"],
      description: "Duration of the generated video in seconds",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"],
      description: "Video aspect ratio",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "720p",
      options: ["480p", "720p", "1080p"],
      description:
        "Video resolution — 480p for faster generation, 720p for balance, 1080p for higher quality",
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
      name: "web_search",
      label: "Web Search",
      type: "boolean",
      required: false,
      default: false,
      description: "Use online search to enhance generation",
      status: "hidden",
    },
  ],
};

/**
 * Seedance 2.0 Fast - First/Last Frame Image to Video
 * Same as Seedance 2.0 but with faster generation (higher cost)
 */
const seedance20Fast: VideoModelConfig = {
  id: "seedance-2.0-fast",
  name: "Seedance 2.0 Fast",
  description:
    "ByteDance's next-gen video generation (fast) with first/last frame control, text-to-video support, and native audio",
  imageParams: {
    sourceImage: "first_frame_url",
    endImage: "last_frame_url",
  },
  providers: [
    { provider: "kie", providerModelId: "bytedance/seedance-2-fast" },
    {
      provider: "fal",
      providerModelId: "bytedance/seedance-2.0/fast",
      paramMapping: { first_frame_url: "image_url", last_frame_url: "end_image_url" },
    },
    { provider: "volcengine", providerModelId: "doubao-seedance-2-0-fast-260128" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "Text prompt for video generation (3-2500 characters)",
      maxLength: 2500,
    },
    {
      name: "first_frame_url",
      label: "First Frame",
      type: "string",
      required: false,
      description: "URL of the first frame image (optional — omit for text-to-video)",
    },
    {
      name: "last_frame_url",
      label: "Last Frame",
      type: "string",
      required: false,
      description: "URL of the last frame image (optional)",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "8",
      options: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "15"],
      description: "Duration of the generated video in seconds",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"],
      description: "Video aspect ratio (adaptive matches input image)",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "720p",
      options: ["480p", "720p"],
      description: "Video resolution — 480p for faster generation, 720p for higher quality",
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
      name: "web_search",
      label: "Web Search",
      type: "boolean",
      required: false,
      default: false,
      description: "Use online search to enhance generation",
      status: "hidden",
    },
  ],
};

/**
 * Seedance 2.0 Fast Reference - Multimodal Reference to Video
 * Same as Seedance 2.0 Reference but with faster generation (higher cost)
 */
const seedance20FastReference: VideoModelConfig = {
  id: "seedance-2.0-fast-reference",
  name: "Seedance 2.0 Fast Reference",
  description:
    "Fast multimodal reference-to-video: attach images, videos, and audio as named references (@image1, @video1, @audio1) to guide generation",
  providers: [
    { provider: "kie", providerModelId: "bytedance/seedance-2-fast" },
    { provider: "fal", providerModelId: "bytedance/seedance-2.0/fast" },
    { provider: "volcengine", providerModelId: "doubao-seedance-2-0-fast-260128" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description:
        "Text prompt for video generation. Use @image1, @video1, @audio1, etc. to reference attached media (3-2500 characters)",
      maxLength: 2500,
    },
    {
      name: "media_references",
      label: "Media References",
      type: "media_references",
      required: false,
      maxItems: 12,
      description:
        "Attach reference images (max 9), videos (max 3, combined max 15s), and audio files (max 3, MP3/WAV, combined max 15s). Each gets auto-named @image1/@video1/@audio1 etc.",
    },
    {
      name: "reference_video_duration",
      label: "Reference Video Duration",
      type: "number",
      required: false,
      default: 0,
      min: 0,
      max: 15,
      description: "Combined duration in seconds of all reference videos (0 if none)",
      status: "hidden",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "8",
      options: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "15"],
      description: "Duration of the generated video in seconds",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"],
      description: "Video aspect ratio",
    },
    {
      name: "resolution",
      label: "Resolution",
      type: "enum",
      required: false,
      default: "720p",
      options: ["480p", "720p"],
      description: "Video resolution — 480p for faster generation, 720p for higher quality",
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
      name: "web_search",
      label: "Web Search",
      type: "boolean",
      required: false,
      default: false,
      description: "Use online search to enhance generation",
      status: "hidden",
    },
  ],
};

/**
 * MiniMax Hailuo 2.3 Fast Pro - Image to Video
 * Advanced fast image-to-video generation model with 1080p resolution
 */
const hailuo23FastPro: VideoModelConfig = {
  id: "hailuo-2.3-fast-pro",
  name: "Hailuo 2.3 Fast Pro",
  description:
    "MiniMax's fast image-to-video model with 1080p output and prompt optimization",
  imageParams: {
    sourceImage: "image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video" },
    { provider: "kie", providerModelId: "PLACEHOLDER_kie_hailuo_23_fast_pro" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "Text prompt for video generation",
      maxLength: 2500,
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
  id: "hailuo-2.3-pro",
  name: "Hailuo 2.3 Pro",
  description:
    "MiniMax's high-quality image-to-video model with 1080p output and prompt optimization",
  imageParams: {
    sourceImage: "image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/minimax/hailuo-2.3/pro/image-to-video" },
    { provider: "kie", providerModelId: "PLACEHOLDER_kie_hailuo_23_pro" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "Text prompt for video generation",
      maxLength: 2500,
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
  id: "hailuo-02-pro",
  name: "Hailuo 02 Pro",
  description:
    "MiniMax's high-quality image-to-video model with 1080p output and prompt optimization",
  imageParams: {
    sourceImage: "image_url",
    endImage: "end_image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/minimax/hailuo-02/pro/image-to-video" },
    { provider: "kie", providerModelId: "PLACEHOLDER_kie_hailuo_02_pro" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "Text prompt for video generation",
      maxLength: 2500,
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
  id: "wan-v2.6",
  name: "Wan v2.6",
  description:
    "High-quality image-to-video with up to 15s duration and intelligent multi-shot segmentation",
  imageParams: {
    sourceImage: "image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "wan/v2.6/image-to-video" },
    {
      provider: "kie",
      providerModelId: "wan/2-6-image-to-video",
      paramMapping: { image_url: "image_urls" },
      paramOverrides: {
        negative_prompt: { status: "disabled" },
        enable_prompt_expansion: { status: "disabled" },
        seed: { status: "disabled" },
        enable_safety_checker: { status: "disabled" },
      },
    },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description:
        "The text prompt describing the desired video motion. Max 800 characters.",
      maxLength: 800,
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
  id: "kling-v2.6-pro",
  name: "Kling Video v2.6 Pro",
  description:
    "Top-tier image-to-video with cinematic visuals, fluid motion, and native audio generation",
  imageParams: {
    sourceImage: "start_image_url",
    endImage: "end_image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/kling-video/v2.6/pro/image-to-video" },
    { provider: "kie", providerModelId: "kling-2.6/image-to-video", paramMapping: { start_image_url: "image_urls", generate_audio: "sound" }, paramOverrides: { negative_prompt: { status: "disabled" }, end_image_url: { status: "disabled" }, voice_ids: { status: "disabled" } } },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description:
        "The text prompt used to generate the video. Supports speech in quotes for audio generation.",
      maxLength: 2500,
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
  id: "kling-o1-pro",
  name: "Kling O1 Pro",
  description:
    "Generate a video by animating the transition between start and end frames",
  imageParams: {
    sourceImage: "start_image_url",
    endImage: "end_image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/kling-video/o1/image-to-video" },
    { provider: "kie", providerModelId: "PLACEHOLDER_kie_kling_o1_pro" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description:
        "Use @Image1 to reference the start frame, @Image2 to reference the end frame.",
      maxLength: 2500,
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
  id: "kling-o3-pro",
  name: "Kling O3 Pro",
  description:
    "Generate a video by animating the transition between start and end frames with text-driven style and scene guidance",
  imageParams: {
    sourceImage: "image_url",
    endImage: "end_image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/kling-video/o3/pro/image-to-video" },
    { provider: "kie", providerModelId: "PLACEHOLDER_kie_kling_o3_pro" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: false,
      description:
        "Text prompt for video generation describing the desired motion and style",
      maxLength: 2500,
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
  id: "kling-v3-pro",
  name: "Kling Video v3 Pro",
  description:
    "Top-tier image-to-video with cinematic visuals, fluid motion, native audio generation, and custom element support",
  imageParams: {
    sourceImage: "start_image_url",
    endImage: "end_image_url",
  },
  providers: [
    {
      provider: "fal",
      providerModelId: "fal-ai/kling-video/v3/pro/image-to-video",
      paramOverrides: {
        mode: { status: "disabled" },
        multi_shots: { status: "disabled" },
        multi_prompt: { status: "disabled" },
        kling_elements: { status: "disabled" },
      },
    },
    {
      provider: "kie",
      providerModelId: "kling-3.0/video",
      paramMapping: { start_image_url: "image_urls", generate_audio: "sound" },
      paramOverrides: {
        negative_prompt: { status: "disabled" },
        cfg_scale: { status: "disabled" },
      },
    },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: false,
      description:
        "Text prompt for video generation. Supports speech in quotes for audio generation. Use @element_name to reference elements.",
      maxLength: 2500,
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
      name: "mode",
      label: "Mode",
      type: "enum",
      required: false,
      default: "pro",
      options: ["std", "pro"],
      description:
        "Generation mode. std has standard resolution, pro has higher resolution",
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
    {
      name: "multi_shots",
      label: "Multi-Shot Mode",
      type: "boolean",
      required: false,
      default: false,
      description:
        "Enable multi-shot mode. When true, uses multi_prompt array for per-shot prompts instead of the main prompt.",
    },
    {
      name: "multi_prompt",
      label: "Shot Prompts",
      type: "multi_prompt",
      required: false,
      description:
        "Shot prompts for multi-shot mode. Each shot has a prompt (max 500 chars) and duration (1-12s). Max 5 shots. Use @element_name to reference elements.",
    },
    {
      name: "kling_elements",
      label: "Element References",
      type: "kling_elements",
      required: false,
      maxItems: 3,
      description:
        "Referenced elements. Define elements with a name, description, and 2-4 reference image IDs from the conversation. Reference in prompts using @element_name syntax. Max 3 elements.",
    },
  ],
};

/**
 * Veo 3.1 - Image to Video
 * Google's state-of-the-art image-to-video generation model
 */
const veo31: VideoModelConfig = {
  id: "veo-3.1",
  name: "Veo 3.1",
  description:
    "Google DeepMind's state-of-the-art video generation model — supports both text-to-video and image-to-video",
  providers: [
    { provider: "fal", providerModelId: "fal-ai/veo3.1/image-to-video" },
    { provider: "kie", providerModelId: "veo3", paramMapping: { image_url: "imageUrls" }, paramOverrides: { negative_prompt: { status: "disabled" }, seed: { status: "disabled" }, auto_fix: { status: "disabled" }, resolution: { status: "disabled" } } },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video to generate",
      maxLength: 2500,
    },
    {
      name: "image_url",
      label: "Reference Image",
      type: "asset",
      required: false,
      acceptTypes: ["image"],
      description:
        "Optional image — if provided, generates video from this image; otherwise generates from text only",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["16:9", "9:16"],
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
  id: "veo-3.1-first-last-frame",
  name: "Veo 3.1 First-Last-Frame",
  description:
    "Google DeepMind's video generation from first and last frames with optional audio",
  imageParams: {
    sourceImage: "first_frame_url",
    endImage: "last_frame_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/veo3.1/first-last-frame-to-video" },
    { provider: "kie", providerModelId: "veo3", paramMapping: { first_frame_url: "imageUrls" }, paramOverrides: { negative_prompt: { status: "disabled" }, seed: { status: "disabled" }, auto_fix: { status: "disabled" }, resolution: { status: "disabled" } } },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video you want to generate",
      maxLength: 2500,
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
      required: false,
      description: "URL of the last frame of the video (optional)",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["16:9", "9:16"],
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
  id: "sora-2-pro",
  name: "Sora 2 Pro",
  description:
    "OpenAI's state-of-the-art image-to-video model capable of detailed clips with audio",
  imageParams: {
    sourceImage: "image_url",
  },
  providers: [
    { provider: "fal", providerModelId: "fal-ai/sora-2/image-to-video/pro" },
    {
      provider: "kie",
      providerModelId: "sora-2-pro-image-to-video",
      paramMapping: { image_url: "image_urls" },
      paramOverrides: {
        resolution: { status: "disabled" },
        duration: { status: "disabled" },
        delete_video: { status: "disabled" },
        aspect_ratio: {
          options: ["landscape", "portrait"],
          default: "landscape",
        },
      },
    },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video to generate",
      maxLength: 2500,
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
      default: "landscape",
      options: ["landscape", "portrait", "9:16", "16:9"],
      description: "Aspect ratio of the generated video",
    },
    {
      name: "n_frames",
      label: "Frame Count",
      type: "enum",
      required: false,
      default: "10",
      options: ["10", "15"],
      description: "Number of frames (10 ≈ short clip, 15 ≈ longer clip)",
    },
    {
      name: "size",
      label: "Quality",
      type: "enum",
      required: false,
      default: "standard",
      options: ["standard", "high"],
      description: "Output quality: standard or high",
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
 * Sora 2 Standard - Image to Video
 * OpenAI's stable image-to-video model via KIE
 */
const sora2Standard: VideoModelConfig = {
  id: "sora-2-standard",
  name: "Sora 2 Standard",
  description:
    "OpenAI's stable image-to-video generation model for reliable video creation",
  imageParams: {
    sourceImage: "image_url",
  },
  providers: [
    { provider: "kie", providerModelId: "sora-2-image-to-video", paramMapping: { image_url: "image_urls" } },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video to generate",
      maxLength: 2500,
    },
    {
      name: "image_url",
      label: "Source Image",
      type: "string",
      required: true,
      description: "The URL of the image to use as the first frame",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "landscape",
      options: ["landscape", "portrait"],
      description: "Aspect ratio of the generated video",
    },
    {
      name: "n_frames",
      label: "Frame Count",
      type: "enum",
      required: false,
      default: "10",
      options: ["10", "15"],
      description: "Number of frames (10 ≈ short clip, 15 ≈ longer clip)",
    },
  ],
};

/**
 * Sora 2 Standard - Text to Video
 * OpenAI's stable text-to-video model via KIE
 */
const sora2TextToVideo: VideoModelConfig = {
  id: "sora-2-text-to-video",
  name: "Sora 2 Text-to-Video",
  description:
    "OpenAI's stable text-to-video generation model — no source image required",
  providers: [
    { provider: "kie", providerModelId: "sora-2-text-to-video" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video to generate",
      maxLength: 2500,
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "landscape",
      options: ["landscape", "portrait"],
      description: "Aspect ratio of the generated video",
    },
    {
      name: "n_frames",
      label: "Frame Count",
      type: "enum",
      required: false,
      default: "10",
      options: ["10", "15"],
      description: "Number of frames (10 ≈ short clip, 15 ≈ longer clip)",
    },
  ],
};

/**
 * Sora 2 Pro - Text to Video
 * OpenAI's high-quality text-to-video model via KIE
 */
const sora2ProTextToVideo: VideoModelConfig = {
  id: "sora-2-pro-text-to-video",
  name: "Sora 2 Pro Text-to-Video",
  description:
    "OpenAI's high-quality text-to-video generation model — no source image required",
  providers: [
    { provider: "kie", providerModelId: "sora-2-pro-text-to-video" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video to generate",
      maxLength: 2500,
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "landscape",
      options: ["landscape", "portrait"],
      description: "Aspect ratio of the generated video",
    },
    {
      name: "n_frames",
      label: "Frame Count",
      type: "enum",
      required: false,
      default: "10",
      options: ["10", "15"],
      description: "Number of frames (10 ≈ short clip, 15 ≈ longer clip)",
    },
    {
      name: "size",
      label: "Size",
      type: "enum",
      required: false,
      default: "standard",
      options: ["standard", "high"],
      description: "Output size: standard or high quality",
    },
  ],
};

/**
 * Kling 2.6 - Text to Video
 * Kling's text-to-video model via KIE
 */
const kling26TextToVideo: VideoModelConfig = {
  id: "kling-2.6-text-to-video",
  name: "Kling 2.6 Text-to-Video",
  description:
    "Kling's text-to-video generation model with audio support — no source image required",
  providers: [
    { provider: "kie", providerModelId: "kling-2.6/text-to-video" },
  ],
  params: [
    {
      name: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The text prompt describing the video to generate",
      maxLength: 2500,
    },
    {
      name: "sound",
      label: "Generate Audio",
      type: "boolean",
      required: false,
      default: true,
      description: "Whether to generate audio for the video",
    },
    {
      name: "aspect_ratio",
      label: "Aspect Ratio",
      type: "enum",
      required: false,
      default: "16:9",
      options: ["1:1", "16:9", "9:16"],
      description: "Aspect ratio of the generated video",
    },
    {
      name: "duration",
      label: "Duration (seconds)",
      type: "enum",
      required: false,
      default: "5",
      options: ["5", "10"],
      description: "Duration of the generated video in seconds",
    },
  ],
};

/**
 * Registry of all supported video models
 */
export const VIDEO_MODELS: VideoModelConfig[] = [
  seedanceV15Pro,
  seedance20,
  seedance20Reference,
  seedance20Fast,
  seedance20FastReference,
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
  sora2Standard,
  sora2TextToVideo,
  sora2ProTextToVideo,
  kling26TextToVideo,
];

/**
 * Default model ID
 */
export const DEFAULT_VIDEO_MODEL_ID = "seedance-2.0";

/**
 * Mapping from legacy fal model IDs to new stable display IDs.
 * Used for DB migration and backward compatibility.
 */
export const LEGACY_MODEL_ID_MAP: Record<string, string> = {
  "fal-ai/bytedance/seedance/v1.5/pro/image-to-video": "seedance-v1.5-pro",
  "fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video": "hailuo-2.3-fast-pro",
  "fal-ai/minimax/hailuo-2.3/pro/image-to-video": "hailuo-2.3-pro",
  "fal-ai/minimax/hailuo-02/pro/image-to-video": "hailuo-02-pro",
  "wan/v2.6/image-to-video": "wan-v2.6",
  "fal-ai/kling-video/v2.6/pro/image-to-video": "kling-v2.6-pro",
  "fal-ai/kling-video/o1/image-to-video": "kling-o1-pro",
  "fal-ai/kling-video/o3/pro/image-to-video": "kling-o3-pro",
  "fal-ai/kling-video/v3/pro/image-to-video": "kling-v3-pro",
  "fal-ai/veo3.1/image-to-video": "veo-3.1",
  "fal-ai/veo3.1/first-last-frame-to-video": "veo-3.1-first-last-frame",
  "fal-ai/sora-2/image-to-video/pro": "sora-2-pro",
};

/**
 * Get a video model config by ID.
 * Returns the model with effective params (provider overrides applied).
 */
export function getVideoModel(modelId: string): VideoModelConfig | undefined {
  const model = VIDEO_MODELS.find((m) => m.id === modelId);
  if (!model) return undefined;
  const params = getEffectiveParams(model);
  if (params === model.params) return model;
  return { ...model, params };
}

/**
 * Resolve effective parameters for a provider variant by merging
 * the base model params with the variant's overrides.
 */
export function resolveParamsForProvider(
  model: VideoModelConfig,
  variant: ProviderVariant
): VideoModelParam[] {
  if (!variant.paramOverrides) return model.params;

  return model.params.map((p) => {
    const override = variant.paramOverrides![p.name];
    if (!override) return p;
    return { ...p, ...override };
  });
}

/**
 * Provider resolver callback, lazily loaded from provider-config.ts.
 * Cached after first call.
 */
let _providerResolver:
  | ((modelId: string) => ProviderVariant | null)
  | null = null;
let _resolverLoaded = false;

export function setProviderResolver(
  resolver: (modelId: string) => ProviderVariant | null
): void {
  _providerResolver = resolver;
  _resolverLoaded = true;
}

/**
 * Resolve the effective params for a model considering the active provider's overrides.
 */
function getEffectiveParams(model: VideoModelConfig): VideoModelParam[] {
  if (!_resolverLoaded) {
    _resolverLoaded = true;
    try {
      require("./provider-config");
    } catch {
      // Client-side or test env — provider-config unavailable, use base params
    }
  }
  if (!_providerResolver) return model.params;
  try {
    const variant = _providerResolver(model.id);
    if (!variant) return model.params;
    return resolveParamsForProvider(model, variant);
  } catch {
    return model.params;
  }
}

/**
 * Get the default values for a model's parameters
 * Skips disabled parameters as they don't participate in replace and fill
 */
export function getModelDefaults(modelId: string): Record<string, any> {
  const model = getVideoModel(modelId);
  if (!model) return {};

  const params = getEffectiveParams(model);
  const defaults: Record<string, any> = {};
  for (const param of params) {
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
 * - "hidden": Not shown in UI; keeps system-provided value if present, otherwise default
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

  const params = getEffectiveParams(model);

  // Start with defaults (already excludes disabled params)
  const merged = getModelDefaults(modelId);

  // Validate and merge user params
  for (const param of params) {
    if (param.status === "disabled") continue;
    if (param.status === "hidden") {
      // Hidden params keep the provided value when present (e.g.
      // reference_video_duration set by the system), otherwise default.
      if (userParams[param.name] !== undefined) {
        merged[param.name] = userParams[param.name];
      }
      continue;
    }

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
        if (param.maxLength !== undefined && userValue.length > param.maxLength) {
          throw new Error(
            `Parameter ${param.name} must not exceed ${param.maxLength} characters (currently ${userValue.length})`
          );
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

      case "asset":
        if (typeof userValue !== "string") {
          throw new Error(`Parameter ${param.name} must be a string`);
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

      case "multi_prompt":
        if (!Array.isArray(userValue)) {
          throw new Error(
            `Parameter ${param.name} must be an array of shot objects`
          );
        }
        if (userValue.length > 5) {
          throw new Error(
            `Parameter ${param.name} allows maximum 5 shots`
          );
        }
        for (const shot of userValue) {
          if (typeof shot !== "object" || shot === null) {
            throw new Error(
              `Each shot in ${param.name} must be an object with prompt and duration`
            );
          }
          if (typeof shot.prompt !== "string") {
            throw new Error(
              `Each shot in ${param.name} must have a string prompt`
            );
          }
          if (shot.prompt.length > 500) {
            throw new Error(
              `Shot prompt in ${param.name} must be at most 500 characters`
            );
          }
          const dur =
            typeof shot.duration === "string"
              ? parseInt(shot.duration, 10)
              : shot.duration;
          if (typeof dur !== "number" || isNaN(dur) || dur < 1 || dur > 12) {
            throw new Error(
              `Shot duration in ${param.name} must be an integer between 1 and 12`
            );
          }
        }
        break;

      case "kling_elements":
        if (!Array.isArray(userValue)) {
          throw new Error(
            `Parameter ${param.name} must be an array of element objects`
          );
        }
        if (
          param.maxItems !== undefined &&
          userValue.length > param.maxItems
        ) {
          throw new Error(
            `Parameter ${param.name} allows maximum ${param.maxItems} elements`
          );
        }
        for (const elem of userValue) {
          if (typeof elem !== "object" || elem === null) {
            throw new Error(
              `Each element in ${param.name} must be an object with name, description, and element_input_urls`
            );
          }
          if (typeof elem.name !== "string" || !elem.name) {
            throw new Error(
              `Each element in ${param.name} must have a non-empty name`
            );
          }
          if (typeof elem.description !== "string" || !elem.description.trim()) {
            throw new Error(
              `Each element in ${param.name} must have a non-empty description`
            );
          }
          const urls = elem.element_input_urls || elem.element_input_ids || [];
          if (!Array.isArray(urls)) {
            throw new Error(
              `Each element in ${param.name} must have an element_input_urls or element_input_ids array`
            );
          }
          if (urls.length < 2 || urls.length > 4) {
            throw new Error(
              `Each element in ${param.name} must have 2-4 images`
            );
          }
          for (const v of urls) {
            if (typeof v !== "string") {
              throw new Error(
                `Element images in ${param.name} must be strings`
              );
            }
          }
        }
        break;

      case "media_references":
        if (!Array.isArray(userValue)) {
          throw new Error(
            `Parameter ${param.name} must be an array of media reference objects`
          );
        }
        if (
          param.maxItems !== undefined &&
          userValue.length > param.maxItems
        ) {
          throw new Error(
            `Parameter ${param.name} allows maximum ${param.maxItems} references`
          );
        }
        for (const ref of userValue) {
          if (typeof ref !== "object" || ref === null) {
            throw new Error(
              `Each reference in ${param.name} must be an object with type and id`
            );
          }
          if (ref.type !== "image" && ref.type !== "video" && ref.type !== "audio") {
            throw new Error(
              `Each reference in ${param.name} must have type "image", "video", or "audio"`
            );
          }
          if (typeof ref.id !== "string" || !ref.id) {
            throw new Error(
              `Each reference in ${param.name} must have a non-empty id`
            );
          }
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

  const params = getEffectiveParams(model);

  return {
    id: model.id,
    name: model.name,
    description: model.description,
    imageParams: model.imageParams || null,
    params: params
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
        maxLength: p.maxLength,
        acceptTypes: p.acceptTypes,
      })),
  };
}

/**
 * Get model config for admin pricing UI
 * Includes hidden parameters (still excludes disabled) so admins can
 * reference them in pricing formulas. Hidden params — e.g.
 * reference_video_duration — aren't shown in user-facing config UIs but
 * still flow into calculateCost.
 */
export function getModelConfigForAdmin(modelId: string) {
  const model = getVideoModel(modelId);
  if (!model) return null;

  const params = getEffectiveParams(model);

  return {
    id: model.id,
    name: model.name,
    description: model.description,
    imageParams: model.imageParams || null,
    params: params
      .filter((p) => p.status !== "disabled")
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
        maxLength: p.maxLength,
        acceptTypes: p.acceptTypes,
      })),
  };
}

/**
 * Get all models for API response
 */
export function getAllModelsForApi() {
  return VIDEO_MODELS.map((m) => getModelConfigForApi(m.id));
}

/**
 * Build a human-readable description of a model's user-facing parameters
 * for inclusion in the AI system prompt. Excludes image params (handled
 * automatically), hidden/disabled params, and the prompt param (always required).
 */
function describeModelParams(model: VideoModelConfig): string {
  const params = getEffectiveParams(model);
  const lines: string[] = [];
  for (const param of params) {
    if (param.status === "hidden" || param.status === "disabled") continue;
    if (param.name === "prompt") continue;
    if (model.imageParams && param.name === model.imageParams.sourceImage) continue;
    if (model.imageParams && param.name === model.imageParams.endImage) continue;

    let desc = `- ${param.name}`;
    if (param.label) desc += ` (${param.label})`;
    desc += `: `;

    if (param.type === "enum" && param.options?.length) {
      desc += `Options: ${param.options.map((o) => JSON.stringify(o)).join(", ")}`;
    } else if (param.type === "boolean") {
      desc += `true/false`;
    } else if (param.type === "number") {
      const parts: string[] = ["number"];
      if (param.min !== undefined) parts.push(`min ${param.min}`);
      if (param.max !== undefined) parts.push(`max ${param.max}`);
      desc += parts.join(", ");
    } else if (param.type === "string") {
      desc += "string";
    } else if (param.type === "string_array") {
      desc += "array of strings";
      if (param.maxItems) desc += ` (max ${param.maxItems})`;
    } else if (param.type === "asset") {
      const accepts = param.acceptTypes?.join("/") || "image";
      desc += `${accepts} reference — pass the Image ID (e.g. "abc123") of an image from the conversation`;
    } else if (param.type === "multi_prompt") {
      desc += `array of shots, each: {prompt: string (max 500 chars, use @element_name to reference elements), duration: number (1-12 seconds)}. Max 5 shots. Only used when multi_shots is true`;
    } else if (param.type === "kling_elements") {
      desc += `array of element references, each: {name: string (referenced in prompt as @name), description: string, element_input_ids: string[] (2-4 Image IDs from the conversation — pass the Image ID e.g. "abc123", NOT a URL)}. Max 3 elements`;
    } else if (param.type === "media_references") {
      desc += `array of media references, each: {type: "image"|"video"|"audio", id: string (Image ID, Video ID, or Audio ID from the conversation — pass the ID e.g. "abc123", NOT a URL)}. Max 9 images, 3 videos, 3 audios. Reference them in the prompt as @image1, @video1, @audio1, etc. (numbered in order of appearance)`;
    }

    if (param.default !== undefined) {
      desc += `. Default: ${JSON.stringify(param.default)}`;
    }
    if (param.description) {
      desc += `. ${param.description}`;
    }

    lines.push(desc);
  }
  return lines.join("\n");
}

/**
 * Generate the dynamic video models section for the AI system prompt.
 * Iterates over every registered model and describes its available parameters
 * so the AI can pick the right model and fill in the correct params.
 */
export function getVideoModelsPromptText(): string {
  const defaultModel = getVideoModel(DEFAULT_VIDEO_MODEL_ID);
  const sections: string[] = [];

  sections.push(`Available video models (${VIDEO_MODELS.length} total):`);
  sections.push(`Default model: "${defaultModel?.name || "unknown"}" (${DEFAULT_VIDEO_MODEL_ID})\n`);

  for (const model of VIDEO_MODELS) {
    const header = `Model: "${model.name}" (modelId: "${model.id}")`;
    const desc = model.description ? `  ${model.description}` : "";
    const hasOptionalRefImage = model.params.some((p) => p.type === "asset" && !p.required);
    const modelType = model.imageParams
      ? "  Type: image-to-video (requires source image)"
      : hasOptionalRefImage
      ? "  Type: text-to-video with optional reference image"
      : "  Type: text-to-video (no source image needed)";
    const supportsEndImage = model.imageParams?.endImage ? "  Supports end image: yes" : "";
    const params = describeModelParams(model);

    sections.push(
      [header, desc, modelType, supportsEndImage, "  Parameters:", params.split("\n").map((l) => "  " + l).join("\n")].filter(Boolean).join("\n")
    );
  }

  return sections.join("\n\n");
}
