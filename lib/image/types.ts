export type ImageOperation = "generate" | "edit";
export type ImageSize = "1k" | "2k" | "4k";
export type ImageQuality = "auto" | "low" | "medium" | "high";

export interface ImageGenerationInput {
  prompt: string;
  aspectRatio?: string;
  imageSize?: ImageSize;
  quality?: ImageQuality;
}

export interface ImageEditInput {
  prompt: string;
  imageIds?: string[];
  imageBase64?: string[];
  aspectRatio?: string;
  imageSize?: ImageSize;
  quality?: ImageQuality;
}

export interface ImageProviderResult {
  imageBuffer: Buffer;
  contentType: string;
  provider: "google" | "fal" | "kie" | "openai";
  providerModelId: string;
  response?: any;
}

export interface ImageResult extends ImageProviderResult {
  modelId: string;
}
