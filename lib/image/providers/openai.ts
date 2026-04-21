import OpenAI, { toFile } from "openai";
import { downloadImage } from "@/lib/storage/s3";
import {
  ImageEditInput,
  ImageGenerationInput,
  ImageProviderResult,
  ImageQuality,
  ImageSize,
} from "../types";

function getClient(): OpenAI {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set; required for OpenAI image provider");
  }
  // Deliberately do NOT pass baseURL. `LLM_BASE_URL` may point to a chat-only
  // proxy that does not expose /v1/images/*. Always use the default OpenAI endpoint.
  return new OpenAI({ apiKey });
}

/**
 * Map the app's ImageSize (1k/2k/4k) + aspectRatio into an OpenAI gpt-image-2
 * pixel-dimension size string.
 *
 * gpt-image-2 accepts any resolution satisfying its constraints, but we use a
 * curated set of popular sizes that match the 2K/4K tiers the app exposes.
 * See docs/gpt-image-2.md Size and quality options.
 */
function mapOpenAISize(
  imageSize?: ImageSize,
  aspectRatio?: string
): string {
  const ar = (aspectRatio || "1:1").trim();
  const size = imageSize || "2k";

  const isLandscape = ar === "16:9" || ar === "3:2" || ar === "4:3";
  const isPortrait = ar === "9:16" || ar === "2:3" || ar === "3:4";

  if (size === "4k") {
    if (isLandscape) return "3840x2160";
    if (isPortrait) return "2160x3840";
    return "2048x2048";
  }

  if (size === "2k") {
    if (isLandscape) return "2048x1152";
    if (isPortrait) return "1152x2048";
    return "2048x2048";
  }

  if (isLandscape) return "1536x1024";
  if (isPortrait) return "1024x1536";
  return "1024x1024";
}

function mapOpenAIQuality(quality?: ImageQuality): "low" | "medium" | "high" | "auto" {
  if (quality === "low" || quality === "medium" || quality === "high") return quality;
  return "auto";
}

function decodeB64Image(b64: string): { buffer: Buffer; contentType: string } {
  return { buffer: Buffer.from(b64, "base64"), contentType: "image/png" };
}

async function idToFile(imageId: string, index: number) {
  const buffer = await downloadImage(imageId);
  if (!buffer) {
    throw new Error(`Failed to download image ${imageId} for OpenAI edit`);
  }
  return await toFile(buffer, `image-${index}.png`, { type: "image/png" });
}

export async function generateWithOpenAI(
  modelId: string,
  input: ImageGenerationInput
): Promise<ImageProviderResult> {
  const client = getClient();
  const size = mapOpenAISize(input.imageSize, input.aspectRatio);
  const quality = mapOpenAIQuality(input.quality);

  // Cast through `any` because the installed openai SDK types (v6.34.x) don't
  // yet enumerate gpt-image-2's expanded size set (e.g. 2048x2048, 3840x2160).
  // The runtime API accepts them.
  const response = await client.images.generate({
    model: modelId,
    prompt: input.prompt,
    size: size as any,
    quality: quality as any,
    n: 1,
  } as any);

  const b64 = (response as any)?.data?.[0]?.b64_json;
  if (!b64) {
    const error = new Error("No image data in OpenAI generate response");
    (error as any).response = response;
    throw error;
  }

  const decoded = decodeB64Image(b64);
  return {
    imageBuffer: decoded.buffer,
    contentType: decoded.contentType,
    provider: "openai",
    providerModelId: modelId,
    response,
  };
}

export async function editWithOpenAI(
  modelId: string,
  input: ImageEditInput
): Promise<ImageProviderResult> {
  const client = getClient();
  const size = mapOpenAISize(input.imageSize, input.aspectRatio);
  const quality = mapOpenAIQuality(input.quality);

  const imageIds = input.imageIds || [];
  if (imageIds.length === 0) {
    throw new Error("OpenAI edit requires imageIds");
  }

  const files = await Promise.all(imageIds.map((id, i) => idToFile(id, i)));

  const response = await client.images.edit({
    model: modelId,
    image: files as any,
    prompt: input.prompt,
    size: size as any,
    quality: quality as any,
    n: 1,
  } as any);

  const b64 = (response as any)?.data?.[0]?.b64_json;
  if (!b64) {
    const error = new Error("No image data in OpenAI edit response");
    (error as any).response = response;
    throw error;
  }

  const decoded = decodeB64Image(b64);
  return {
    imageBuffer: decoded.buffer,
    contentType: decoded.contentType,
    provider: "openai",
    providerModelId: modelId,
    response,
  };
}
