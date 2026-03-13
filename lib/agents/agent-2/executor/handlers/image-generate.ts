import { MessageContentPart } from "@/lib/llm/types";
import { ImageSize } from "@/lib/image/types";
import { ToolHandler, ToolResult } from "../tool-executor";
import { ParsedTag } from "../../core/output-parser";
import { RequestContext } from "../../context";
import {
  downloadImage,
  uploadImage,
  getSignedImageUrl,
  generateImageId,
} from "@/lib/storage/s3";
import {
  editImageWithModel,
  generateImageWithModel,
} from "@/lib/image/service";
import { getImageModel } from "@/lib/image/models";
import { calculateCost } from "@/lib/pricing";
import {
  deductCredits,
  getUserBalance,
  InsufficientCreditsError,
} from "@/lib/credits";
import { recordEvent, sanitizeGeminiResponse } from "@/lib/telemetry";

const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
] as const;
type AspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

const MAX_RETRY = 2;

/**
 * Handler for image_suggest tool (JSON tag).
 * Unlike other handlers, this one is called per-suggestion and handles
 * the full image generation lifecycle including retries, credit checks,
 * and upload.
 *
 * The stream loop calls this handler for each JSON tag, passing the
 * parsed suggestion object.
 */
export class ImageGenerateHandler implements ToolHandler {
  async execute(parsedTag: ParsedTag, ctx: RequestContext): Promise<ToolResult> {
    const suggestion = parsedTag.parsedContent;
    // Use tracking ID from the caller (stream loop) if provided, otherwise generate one
    const trackingImageId = suggestion._trackingImageId || generateImageId();

    // NOTE: The stream loop already emits the loading placeholder and manages
    // finalContent tracking. This handler only does the actual generation.

    try {
      const part = await this.generateImageWithRetry(
        suggestion,
        ctx,
        trackingImageId
      );

      ctx.send({ type: "part_update", imageId: trackingImageId, part });

      return {
        success: true,
        contentParts: [part],
      };
    } catch (err) {
      console.error(`Image gen error for imageId ${trackingImageId}`, err);
      const isInsufficientCredits = err instanceof InsufficientCreditsError;
      const errorPart: MessageContentPart = {
        type: "agent_image",
        imageId: trackingImageId,
        title: suggestion.title || "Error",
        aspectRatio: "1:1",
        prompt: suggestion.prompt || "",
        status: "error",
        ...(isInsufficientCredits && { reason: "INSUFFICIENT_CREDITS" }),
      };

      ctx.send({ type: "part_update", imageId: trackingImageId, part: errorPart });

      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        contentParts: [errorPart],
      };
    }
  }

  /**
   * Generate an image with up to MAX_RETRY retries.
   * Ported from Agent 1's generateImage() + generateImageCore().
   */
  private async generateImageWithRetry(
    suggestion: { title: string; aspectRatio: string; prompt: string },
    ctx: RequestContext,
    trackingImageId: string
  ): Promise<MessageContentPart> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `[Agent-2] Retrying image generation, attempt ${attempt + 1}/${MAX_RETRY + 1}`
          );
        }

        const result = await this.generateImageCore(suggestion, ctx, trackingImageId);

        if (attempt > 0) {
          console.log(
            `[Agent-2] Image generation succeeded on retry attempt ${attempt + 1}`
          );
        }

        return result;
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          throw error;
        }
        lastError = error as Error;
        console.error(
          `[Agent-2] Image generation attempt ${attempt + 1}/${MAX_RETRY + 1} failed:`,
          error
        );
      }
    }

    // All retries exhausted - record failure event
    const modelConfig = ctx.imageModelId ? getImageModel(ctx.imageModelId) : undefined;
    const failureMetadata: any = {
      status: "failed",
      provider: modelConfig?.provider || "unknown",
      modelId: ctx.imageModelId,
      error: lastError?.message || "Image generation failed",
      prompt: suggestion.prompt,
      aspectRatio: suggestion.aspectRatio,
      imageSize: ctx.imageSizeOverride || "2k",
    };

    if (lastError && "response" in lastError) {
      const response = (lastError as any).response;
      failureMetadata.response = sanitizeGeminiResponse(response);
    }

    await recordEvent("image_generation", ctx.userId, failureMetadata);

    throw lastError || new Error("Image generation failed");
  }

  private async generateImageCore(
    suggestion: { title: string; aspectRatio: string; prompt: string },
    ctx: RequestContext,
    trackingImageId: string
  ): Promise<MessageContentPart> {
    // Determine aspect ratio: user override > agent suggestion > fallback
    let aspectRatio: AspectRatio;
    if (ctx.aspectRatioOverride && SUPPORTED_ASPECT_RATIOS.includes(ctx.aspectRatioOverride as AspectRatio)) {
      aspectRatio = ctx.aspectRatioOverride as AspectRatio;
      console.log(`[Agent-2] Using user-selected aspect ratio: ${aspectRatio}`);
    } else if (SUPPORTED_ASPECT_RATIOS.includes(suggestion.aspectRatio as AspectRatio)) {
      aspectRatio = suggestion.aspectRatio as AspectRatio;
    } else {
      aspectRatio = "1:1";
    }
    const imageSize: ImageSize = ctx.imageSizeOverride || "2k";

    // Await all image base64 data
    const imageBase64Data = await Promise.all(ctx.imageBase64Promises);
    const validImageBase64: string[] = imageBase64Data.filter(
      (data): data is string => data !== undefined
    );

    const useImageEditing =
      (ctx.precisionEditing && validImageBase64.length > 0) ||
      validImageBase64.length > 0;

    // Calculate cost and verify balance
    const cost = await calculateCost("Image/all", {});
    if (cost > 0) {
      const balance = await getUserBalance(ctx.userId);
      if (balance < cost) {
        throw new InsufficientCreditsError();
      }
    }

    const modelId = ctx.imageModelId;
    let result;

    if (useImageEditing && validImageBase64.length > 0) {
      console.log(
        `[Agent-2] Using image editing mode with ${validImageBase64.length} image(s)`
      );
      result = await editImageWithModel(modelId, {
        prompt: suggestion.prompt,
        imageIds: ctx.imageIds,
        imageBase64: validImageBase64,
        aspectRatio,
        imageSize,
      });
    } else {
      result = await generateImageWithModel(modelId, {
        prompt: suggestion.prompt,
        aspectRatio,
        imageSize,
      });
    }

    // Upload and get final image ID
    const finalImageId = await uploadImage(
      result.imageBuffer,
      result.contentType,
      trackingImageId
    );

    // Deduct credits after successful generation
    if (cost > 0) {
      await deductCredits(
        ctx.userId,
        cost,
        "image_generation",
        `Image generation (${modelId || "default"})`
      );
    }

    const response =
      result.provider === "google"
        ? sanitizeGeminiResponse(result.response)
        : result.response;

    // Record success event
    await recordEvent("image_generation", ctx.userId, {
      status: "success",
      provider: result.provider,
      modelId: result.modelId,
      providerModelId: result.providerModelId,
      prompt: suggestion.prompt,
      aspectRatio,
      imageSize,
      response,
    });

    const imagePart: MessageContentPart = {
      type: "agent_image",
      imageId: finalImageId,
      imageUrl: getSignedImageUrl(finalImageId),
      title: suggestion.title,
      aspectRatio,
      prompt: suggestion.prompt,
      status: "generated",
    };

    console.log(
      `[Perf] Image generation end`,
      `[${Date.now() - ctx.requestStartTime}ms]`,
      `imageId=${finalImageId}`
    );

    return imagePart;
  }
}
