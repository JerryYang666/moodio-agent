import { ImageSize } from "@/lib/image/types";
import { MessageContentPart } from "@/lib/llm/types";
import type { AccountType } from "@/lib/credits";

/** Reference image with tag for context */
export interface ReferenceImageEntry {
  imageId: string;
  tag: "none" | "subject" | "scene" | "item" | "style";
  title?: string;
}

/** Stream event sent to the frontend via SSE. */
export type Expertise = "film" | "ugcAd" | "game" | "musicVideo" | "shortDrama" | "animation";

export type StreamEvent = { type: string; [key: string]: any };

/**
 * Per-request context created once at the start of each request.
 * Accessible by every Agent 2 component (system prompt constructor,
 * input parser, stream loop, tool executor, tool handlers).
 */
export interface RequestContext {
  // Identity
  userId: string;
  isAdmin: boolean;
  requestStartTime: number;

  // Account (for credit operations)
  effectiveAccountId: string;
  effectiveAccountType: AccountType;
  effectivePerformedBy: string;

  // CDN mode
  cnMode: boolean;

  // User-provided images
  imageIds: string[];
  imageBase64Promises: Promise<string | undefined>[];
  referenceImages: ReferenceImageEntry[];

  // Persistent chat context
  persistentTextChunk: string;

  // User overrides that directly control tool behavior
  precisionEditing: boolean;
  aspectRatioOverride?: string;
  imageSizeOverride?: ImageSize;
  imageModelId?: string;
  maxImageQuantity?: number;
  systemPromptOverride?: string;
  expertise?: Expertise;

  // Event emitter for streaming events to frontend
  send: (event: StreamEvent) => void;
}

// Supported aspect ratios (same as Agent 1)
const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

const SUPPORTED_IMAGE_SIZES: ImageSize[] = ["1k", "2k", "4k"];

export interface CreateRequestContextInput {
  userId: string;
  isAdmin: boolean;
  requestStartTime?: number;
  accountId?: string;
  accountType?: AccountType;
  performedBy?: string;
  cnMode?: boolean;
  imageIds?: string[];
  imageBase64Promises?: Promise<string | undefined>[];
  referenceImages?: ReferenceImageEntry[];
  persistentTextChunk?: string;
  precisionEditing?: boolean;
  aspectRatioOverride?: string;
  imageSizeOverride?: ImageSize;
  imageModelId?: string;
  maxImageQuantity?: number;
  systemPromptOverride?: string;
  expertise?: Expertise;
  send: (event: StreamEvent) => void;
}

/**
 * Validates and normalizes raw inputs into a RequestContext.
 * Mirrors the validation currently done inline in Agent 1's processRequest().
 */
export function createRequestContext(input: CreateRequestContextInput): RequestContext {
  // Validate aspect ratio override
  let validatedAspectRatio: string | undefined;
  if (input.aspectRatioOverride) {
    if ((SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(input.aspectRatioOverride)) {
      validatedAspectRatio = input.aspectRatioOverride;
      console.log(`[Agent-2] User selected aspect ratio: ${validatedAspectRatio}`);
    } else {
      console.log(
        `[Agent-2] Invalid aspect ratio "${input.aspectRatioOverride}" provided, falling back to smart mode`
      );
    }
  }

  // Validate image size override
  let validatedImageSize: ImageSize | undefined;
  if (input.imageSizeOverride) {
    if (SUPPORTED_IMAGE_SIZES.includes(input.imageSizeOverride)) {
      validatedImageSize = input.imageSizeOverride;
      console.log(`[Agent-2] User selected image size: ${validatedImageSize}`);
    } else {
      console.log(
        `[Agent-2] Invalid image size "${input.imageSizeOverride}" provided, falling back to 2k`
      );
    }
  }

  return {
    userId: input.userId,
    isAdmin: input.isAdmin,
    requestStartTime: input.requestStartTime || Date.now(),
    effectiveAccountId: input.accountId || input.userId,
    effectiveAccountType: input.accountType || "personal",
    effectivePerformedBy: input.performedBy || input.userId,
    cnMode: input.cnMode || false,
    imageIds: input.imageIds || [],
    imageBase64Promises: input.imageBase64Promises || [],
    referenceImages: input.referenceImages || [],
    persistentTextChunk: input.persistentTextChunk || "",
    precisionEditing: input.precisionEditing || false,
    aspectRatioOverride: validatedAspectRatio,
    imageSizeOverride: validatedImageSize,
    imageModelId: input.imageModelId,
    maxImageQuantity: input.maxImageQuantity,
    systemPromptOverride: input.systemPromptOverride,
    expertise: input.expertise,
    send: input.send,
  };
}
