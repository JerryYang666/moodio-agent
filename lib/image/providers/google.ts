import { GoogleGenAI } from "@google/genai";
import { downloadImage } from "@/lib/storage/s3";
import {
  ImageEditInput,
  ImageGenerationInput,
  ImageProviderResult,
  ImageSize,
} from "../types";

function resolveAspectRatio(aspectRatio?: string): string {
  return aspectRatio || "1:1";
}

function resolveImageSize(imageSize?: ImageSize): "2K" | "4K" {
  return imageSize === "4k" ? "4K" : "2K";
}

export async function generateWithGemini(
  modelId: string,
  input: ImageGenerationInput
): Promise<ImageProviderResult> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const response = await ai.models.generateContent({
    model: modelId,
    contents: input.prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: resolveAspectRatio(input.aspectRatio),
        imageSize: resolveImageSize(input.imageSize),
      },
      tools: [{
        googleSearch: {
          searchTypes: {
            webSearch: {},
            imageSearch: {}
          }
        }
      }],
    },
  });

  const candidates = (response as any).candidates;
  let generatedImageData: string | undefined;
  if (candidates && candidates.length > 0) {
    const parts = candidates[0].content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          generatedImageData = part.inlineData.data;
          break;
        }
      }
    }
  }

  if (!generatedImageData) {
    const error = new Error("No image data in Gemini response");
    (error as any).response = response;
    throw error;
  }

  return {
    imageBuffer: Buffer.from(generatedImageData, "base64"),
    contentType: "image/png",
    provider: "google",
    providerModelId: modelId,
    response,
  };
}

export async function editWithGemini(
  modelId: string,
  input: ImageEditInput
): Promise<ImageProviderResult> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  let imageBase64 = input.imageBase64?.filter(Boolean) || [];
  if (imageBase64.length === 0 && input.imageIds?.length) {
    const buffers = await Promise.all(
      input.imageIds.map((id) => downloadImage(id))
    );
    imageBase64 = buffers
      .filter((buf): buf is Buffer => Boolean(buf))
      .map((buf) => buf.toString("base64"));
  }

  if (imageBase64.length === 0) {
    throw new Error("Gemini edit requires imageBase64 or imageIds");
  }

  const prompt: any[] = [{ text: input.prompt }];
  for (const base64 of imageBase64) {
    prompt.push({
      inlineData: {
        mimeType: "image/png",
        data: base64,
      },
    });
  }

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: resolveAspectRatio(input.aspectRatio),
        imageSize: resolveImageSize(input.imageSize),
      },
      tools: [{
        googleSearch: {
          searchTypes: {
            webSearch: {},
            imageSearch: {}
          }
        }
      }],
    },
  });

  const candidates = (response as any).candidates;
  let generatedImageData: string | undefined;
  if (candidates && candidates.length > 0) {
    const parts = candidates[0].content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          generatedImageData = part.inlineData.data;
          break;
        }
      }
    }
  }

  if (!generatedImageData) {
    const error = new Error("No image data in Gemini response");
    (error as any).response = response;
    throw error;
  }

  return {
    imageBuffer: Buffer.from(generatedImageData, "base64"),
    contentType: "image/png",
    provider: "google",
    providerModelId: modelId,
    response,
  };
}
