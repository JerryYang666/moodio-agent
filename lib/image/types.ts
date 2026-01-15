export type ImageOperation = "generate" | "edit";

export interface ImageGenerationInput {
  prompt: string;
  aspectRatio?: string;
}

export interface ImageEditInput {
  prompt: string;
  imageIds?: string[];
  imageBase64?: string[];
  aspectRatio?: string;
}

export interface ImageProviderResult {
  imageBuffer: Buffer;
  contentType: string;
  provider: "google" | "fal";
  providerModelId: string;
  response?: any;
}

export interface ImageResult extends ImageProviderResult {
  modelId: string;
}
