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
 * Map the app's ImageSize (1k/2k/4k) + aspectRatio into a gpt-image-2 size.
 *
 * Constraints (from OpenAI docs):
 *   - max edge ≤ 3840, both edges multiples of 16, long:short ≤ 3:1
 *   - total pixels in [655_360, 8_294_400]
 *
 * Every pair below is /16 on both edges, hits the requested AR exactly, and
 * fits inside the pixel budget for its tier.
 *
 * When `userAspectRatio` is undefined the user is on "smart" mode — we return
 * `"auto"` so gpt-image-2 infers the ratio from the reference image/prompt
 * rather than us guessing. Previously we mapped every "portrait" ratio
 * (3:4, 2:3, 9:16) to 1152×2048, which squashed 3:4 iPhone photos into 9:16.
 */
const RATIO_TO_SIZE: Record<string, Record<"1k" | "2k" | "4k", string>> = {
  "1:1":  { "1k": "1024x1024", "2k": "2048x2048", "4k": "2880x2880" },
  "16:9": { "1k": "1536x864",  "2k": "2048x1152", "4k": "3840x2160" },
  "9:16": { "1k": "864x1536",  "2k": "1152x2048", "4k": "2160x3840" },
  "3:2":  { "1k": "1536x1024", "2k": "2016x1344", "4k": "3504x2336" },
  "2:3":  { "1k": "1024x1536", "2k": "1344x2016", "4k": "2336x3504" },
  "4:3":  { "1k": "1344x1008", "2k": "2048x1536", "4k": "3264x2448" },
  "3:4":  { "1k": "1008x1344", "2k": "1536x2048", "4k": "2448x3264" },
  "5:4":  { "1k": "1280x1024", "2k": "2080x1664", "4k": "3200x2560" },
  "4:5":  { "1k": "1024x1280", "2k": "1664x2080", "4k": "2560x3200" },
  "21:9": { "1k": "1680x720",  "2k": "2352x1008", "4k": "3696x1584" },
};

function mapOpenAISize(
  imageSize?: ImageSize,
  userAspectRatio?: string
): string {
  if (!userAspectRatio) return "auto";

  const ar = userAspectRatio.trim();
  const size = imageSize || "2k";
  const row = RATIO_TO_SIZE[ar];
  if (!row) {
    console.warn(
      `[OpenAI] Unknown aspect ratio "${ar}", falling back to auto`
    );
    return "auto";
  }
  return row[size];
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
  const size = mapOpenAISize(input.imageSize, input.userAspectRatio);
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
  const size = mapOpenAISize(input.imageSize, input.userAspectRatio);
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
