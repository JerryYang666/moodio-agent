import {
  DEFAULT_IMAGE_MODEL_ID,
  getImageModel,
  ImageModelConfig,
} from "./models";
import { ImageEditInput, ImageGenerationInput, ImageResult } from "./types";
import { generateWithGemini, editWithGemini } from "./providers/google";
import { generateWithSeedream, editWithSeedream } from "./providers/fal";
import { generateWithKie, editWithKie } from "./providers/kie";
import { generateWithOpenAI, editWithOpenAI } from "./providers/openai";

function resolveImageModel(modelId?: string): ImageModelConfig {
  const resolved = modelId ? getImageModel(modelId) : undefined;
  if (resolved) return resolved;
  const fallback = getImageModel(DEFAULT_IMAGE_MODEL_ID);
  if (!fallback) {
    throw new Error("Default image model is not configured");
  }
  return fallback;
}

export async function generateImageWithModel(
  modelId: string | undefined,
  input: ImageGenerationInput
): Promise<ImageResult> {
  const model = resolveImageModel(modelId);
  if (!model.supports.generate || !model.providerModelIds.generate) {
    throw new Error(`Model does not support image generation: ${model.id}`);
  }

  switch (model.provider) {
    case "google":
      return {
        modelId: model.id,
        ...(await generateWithGemini(model.providerModelIds.generate, input)),
      };
    case "fal":
      return {
        modelId: model.id,
        ...(await generateWithSeedream(model.providerModelIds.generate, input)),
      };
    case "kie":
      return {
        modelId: model.id,
        ...(await generateWithKie(model.providerModelIds.generate, input)),
      };
    case "openai":
      return {
        modelId: model.id,
        ...(await generateWithOpenAI(model.providerModelIds.generate, input)),
      };
    default:
      throw new Error(`Unsupported provider: ${model.provider}`);
  }
}

export async function editImageWithModel(
  modelId: string | undefined,
  input: ImageEditInput
): Promise<ImageResult> {
  const model = resolveImageModel(modelId);
  if (!model.supports.edit || !model.providerModelIds.edit) {
    throw new Error(`Model does not support image editing: ${model.id}`);
  }

  switch (model.provider) {
    case "google":
      return {
        modelId: model.id,
        ...(await editWithGemini(model.providerModelIds.edit, input)),
      };
    case "fal":
      return {
        modelId: model.id,
        ...(await editWithSeedream(model.providerModelIds.edit, input)),
      };
    case "kie":
      return {
        modelId: model.id,
        ...(await editWithKie(model.providerModelIds.edit, input)),
      };
    case "openai":
      return {
        modelId: model.id,
        ...(await editWithOpenAI(model.providerModelIds.edit, input)),
      };
    default:
      throw new Error(`Unsupported provider: ${model.provider}`);
  }
}
