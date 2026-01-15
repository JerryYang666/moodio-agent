import { fal } from "@fal-ai/client";
import { getSignedImageUrl } from "@/lib/storage/s3";
import {
  ImageEditInput,
  ImageGenerationInput,
  ImageProviderResult,
} from "../types";

fal.config({
  credentials: process.env.FAL_API_KEY,
});

async function downloadFromUrlWithType(url: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download from URL: ${response.status} ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "image/png",
  };
}

export async function generateWithSeedream(
  modelId: string,
  input: ImageGenerationInput
): Promise<ImageProviderResult> {
  const result = await fal.subscribe(modelId, {
    input: {
      prompt: input.prompt,
      image_size: "auto_2K",
      num_images: 1,
      max_images: 1,
      enable_safety_checker: true,
    },
  });

  const imageUrl = result?.data?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error("No image URL in Seedream response");
  }

  const downloaded = await downloadFromUrlWithType(imageUrl);

  return {
    imageBuffer: downloaded.buffer,
    contentType: downloaded.contentType,
    provider: "fal",
    providerModelId: modelId,
    response: {
      images: [{ url: imageUrl }],
      seed: result?.data?.seed,
    },
  };
}

export async function editWithSeedream(
  modelId: string,
  input: ImageEditInput
): Promise<ImageProviderResult> {
  const imageIds = input.imageIds || [];
  if (imageIds.length === 0) {
    throw new Error("Seedream edit requires imageIds");
  }

  const imageUrls = imageIds.map((id) => getSignedImageUrl(id));

  const result = await fal.subscribe(modelId, {
    input: {
      prompt: input.prompt,
      image_urls: imageUrls,
      image_size: "auto_2K",
      num_images: 1,
      max_images: 1,
      enable_safety_checker: true,
    },
  });

  const imageUrl = result?.data?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error("No image URL in Seedream edit response");
  }

  const downloaded = await downloadFromUrlWithType(imageUrl);

  return {
    imageBuffer: downloaded.buffer,
    contentType: downloaded.contentType,
    provider: "fal",
    providerModelId: modelId,
    response: {
      images: [{ url: imageUrl }],
    },
  };
}
