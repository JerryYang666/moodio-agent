export type ImageOperation = "generate" | "edit";
export type ImageSize = "2k" | "4k";

export interface ImageGenerationInput {
  prompt: string;
  aspectRatio?: string;
  imageSize?: ImageSize;
}

export interface ImageEditInput {
  prompt: string;
  imageIds?: string[];
  imageBase64?: string[];
  aspectRatio?: string;
  imageSize?: ImageSize;
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
