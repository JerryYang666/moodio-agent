// Common types for LLM integration

export const DEFAULT_LLM_MODEL = "gpt-5.3-chat-latest";

export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "internal_think"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | {
      type: "image";
      imageId: string;
      imageUrl?: string; // CloudFront URL from API (access via signed cookies)
      source?: "upload" | "asset" | "ai_generated";
      title?: string; // Display title for the image
    }
  | {
      type: "agent_image";
      imageId?: string; // Generated at start of image generation for tracking
      imageUrl?: string; // CloudFront URL for display (access via signed cookies)
      title: string;
      aspectRatio?: string;
      prompt: string;
      status: "loading" | "generated" | "error";
      isSelected?: boolean;
      reason?: string; // Error reason code (e.g., "INSUFFICIENT_CREDITS")
    }
  | {
      type: "direct_image";
      imageId?: string;
      imageUrl?: string;
      title: string;
      aspectRatio?: string;
      prompt: string;
      status: "loading" | "generated" | "error";
      isSelected?: boolean;
      reason?: string;
    }
  | {
      type: "agent_video";
      config: {
        modelId: string;
        modelName: string;
        prompt: string;
        sourceImageId?: string; // Reference to an image in the chat
        sourceImageUrl?: string; // CloudFront URL for display
        params: Record<string, any>; // Model-specific parameters (duration, resolution, etc.)
      };
      status: "pending" | "creating" | "created" | "error";
      generationId?: string; // Set after video creation starts
      error?: string;
    }
  | {
      type: "direct_video";
      config: {
        modelId: string;
        modelName: string;
        prompt: string;
        sourceImageId: string;
        sourceImageUrl?: string;
        endImageId?: string;
        endImageUrl?: string;
        params: Record<string, any>;
      };
      generationId?: string;
      status: "pending" | "processing" | "completed" | "failed";
      thumbnailImageId?: string;
      thumbnailUrl?: string;
      videoId?: string;
      videoUrl?: string;
      signedVideoUrl?: string;
      error?: string;
      createdAt: string;
      completedAt?: string;
      seed?: number;
    }
  | {
      type: "agent_shot_list";
      title: string;
      columns: string[];
      rows: Array<{ id: string; cells: Array<{ value: string }> }>;
      status: "streaming" | "complete";
      desktopAssetId?: string;
    }
  | {
      type: "agent_search";
      query: {
        textSearch: string;
        filterIds: number[];
      };
      status: "pending" | "executed";
    }
  | {
      type: "video";
      videoId: string;
      source: "retrieval" | "upload" | "library" | "ai_generated";
      videoUrl: string;
    }
  | {
      type: "tool_call";
      tool: string;
      status: "loading" | "complete" | "error";
    };

/** Type for parts that represent generated images (agent_image or direct_image) */
export type GeneratedImagePart = Extract<
  MessageContentPart,
  { type: "agent_image" } | { type: "direct_image" }
>;

/** Check if a message content part is a generated image (agent_image or direct_image) */
export function isGeneratedImagePart(
  part: MessageContentPart
): part is GeneratedImagePart {
  return part.type === "agent_image" || part.type === "direct_image";
}

export interface MessageMetadata {
  mode?: string;
  imageModelId?: string;
  imageSize?: string;
  aspectRatio?: string;
  imageQuantity?: number;
  precisionEditing?: boolean;
  referenceImages?: Array<{
    imageId: string;
    tag?: string;
    title?: string;
  }>;
  videoModelId?: string;
  videoParams?: Record<string, any>;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | MessageContentPart[];
  agentId?: string;
  createdAt?: number; // Unix timestamp in milliseconds
  variantId?: string; // Unique identifier for parallel variants
  metadata?: MessageMetadata;
}

// A message group represents a user message and its assistant response(s)
// When parallel variants are enabled, variants contains multiple assistant responses
export interface MessageWithVariants extends Omit<Message, "variantId"> {
  // For assistant messages with parallel variants
  variants?: Message[]; // Array of parallel assistant message variants
}

// Number of parallel LLM calls to make for each user message
export const PARALLEL_VARIANT_COUNT = 2;

export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  provider?: "openai" | "anthropic";
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>;
  chatComplete(messages: Message[], options?: ChatOptions): Promise<string>;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}
