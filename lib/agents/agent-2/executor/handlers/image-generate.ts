import { MessageContentPart } from "@/lib/llm/types";
import { ImageQuality, ImageSize } from "@/lib/image/types";
import { ToolHandler, ToolResult } from "../tool-executor";
import { ParsedTag } from "../../core/output-parser";
import { RequestContext } from "../../context";
import {
  uploadImage,
  getSignedImageUrl,
  generateImageId,
} from "@/lib/storage/s3";
import {
  editImageWithModel,
  generateImageWithModel,
} from "@/lib/image/service";
import { getImageModel } from "@/lib/image/models";
import {
  calculateCost,
  parseImageSizeToNumber,
  parseImageQualityToNumber,
} from "@/lib/pricing";
import {
  deductCredits,
  assertSufficientCredits,
  InsufficientCreditsError,
  type AccountType,
} from "@/lib/credits";
import {
  recordEvent,
  sanitizeGeminiResponse,
  sanitizeOpenAIResponse,
} from "@/lib/telemetry";
import { classifyImageError } from "@/lib/image/error-classify";

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
    const trackingImageId = suggestion._trackingImageId || generateImageId();
    const isVideoSuggest = parsedTag.toolName === "video_suggest";

    try {
      const part = await this.generateImageWithRetry(
        suggestion,
        ctx,
        trackingImageId,
        isVideoSuggest
      );

      ctx.send({ type: "part_update", imageId: trackingImageId, part });

      return {
        success: true,
        data: {
          imageId: (part as any).imageId,
          imageUrl: (part as any).imageUrl,
        },
        contentParts: [part],
      };
    } catch (err) {
      console.error(`Image gen error for imageId ${trackingImageId}`, err);
      const isInsufficientCredits = err instanceof InsufficientCreditsError;
      const rawMessage = err instanceof Error ? err.message : String(err);
      const reason = isInsufficientCredits
        ? "INSUFFICIENT_CREDITS"
        : classifyImageError(rawMessage);
      const errorPart: MessageContentPart = isVideoSuggest
        ? {
            type: "agent_video_suggest",
            imageId: trackingImageId,
            title: suggestion.title || "Error",
            aspectRatio: "1:1",
            prompt: suggestion.prompt || "",
            videoIdea: suggestion.videoIdea || "",
            status: "error",
            reason,
          }
        : {
            type: "agent_image",
            imageId: trackingImageId,
            title: suggestion.title || "Error",
            aspectRatio: "1:1",
            prompt: suggestion.prompt || "",
            status: "error",
            reason,
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
    suggestion: { title: string; aspectRatio: string; prompt: string; referenceImageIds?: string[]; videoIdea?: string },
    ctx: RequestContext,
    trackingImageId: string,
    isVideoSuggest: boolean = false
  ): Promise<MessageContentPart> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `[Agent-2] Retrying image generation, attempt ${attempt + 1}/${MAX_RETRY + 1}`
          );
        }

        const result = await this.generateImageCore(suggestion, ctx, trackingImageId, isVideoSuggest);

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
      failureMetadata.response =
        modelConfig?.provider === "openai"
          ? sanitizeOpenAIResponse(response)
          : sanitizeGeminiResponse(response);
    }

    await recordEvent("image_generation", ctx.userId, failureMetadata);

    throw lastError || new Error("Image generation failed");
  }

  private async generateImageCore(
    suggestion: { title: string; aspectRatio: string; prompt: string; referenceImageIds?: string[]; videoIdea?: string },
    ctx: RequestContext,
    trackingImageId: string,
    isVideoSuggest: boolean = false
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
    const imageQuality: ImageQuality | undefined = ctx.imageQualityOverride;

    // Pick the reference image set: user-provided ids take precedence;
    // otherwise honour the agent's per-suggestion picks.
    const userImageIds = ctx.imageIds;
    const agentReferenceImageIds: string[] =
      userImageIds.length === 0 && Array.isArray(suggestion.referenceImageIds)
        ? suggestion.referenceImageIds.filter(
            (id: unknown): id is string => typeof id === "string" && id.length > 0
          )
        : [];
    const effectiveImageIds =
      userImageIds.length > 0 ? userImageIds : agentReferenceImageIds;

    const useImageEditing = effectiveImageIds.length > 0;
    // Triggers the per-request shared download / KIE re-upload on the first
    // call of the request; subsequent variants and suggestions in the same
    // request reuse the cached promises and add no S3/KIE traffic.
    const preparedInputs = useImageEditing
      ? await ctx.imageInputPreparer.prepareEditInputs(effectiveImageIds)
      : {};
    if (
      useImageEditing &&
      userImageIds.length === 0 &&
      agentReferenceImageIds.length > 0
    ) {
      console.log(
        `[Agent-2] Using ${agentReferenceImageIds.length} agent-specified reference image(s) for editing`
      );
    }

    const modelId = ctx.imageModelId;

    // Verify balance before doing any work
    const resolution = parseImageSizeToNumber(imageSize);
    const quality = parseImageQualityToNumber(imageQuality);
    const cost = await calculateCost(modelId || "Image/all", {
      resolution,
      quality,
    });
    if (cost > 0) {
      await assertSufficientCredits(ctx.effectiveAccountId, cost, ctx.effectiveAccountType);
    }

    let result;

    // Pass the user's raw pick (undefined in "smart" mode) separately from
    // `aspectRatio`, which has already been merged with the agent's suggestion
    // and a "1:1" fallback above. gpt-image-2 needs to see the raw pick to
    // decide between `size=auto` (smart) and a concrete pixel dimension;
    // other providers only read `aspectRatio` and ignore this field.
    const userAspectRatio = ctx.aspectRatioOverride && SUPPORTED_ASPECT_RATIOS.includes(ctx.aspectRatioOverride as AspectRatio)
      ? ctx.aspectRatioOverride
      : undefined;

    if (useImageEditing) {
      console.log(
        `[Agent-2] Using image editing mode with ${effectiveImageIds.length} image(s)`
      );
      result = await editImageWithModel(modelId, {
        prompt: suggestion.prompt,
        imageIds: effectiveImageIds,
        imageBase64: preparedInputs.imageBase64,
        imageInputUrls: preparedInputs.imageInputUrls,
        aspectRatio,
        userAspectRatio,
        imageSize,
        quality: imageQuality,
      });
    } else {
      result = await generateImageWithModel(modelId, {
        prompt: suggestion.prompt,
        aspectRatio,
        userAspectRatio,
        imageSize,
        quality: imageQuality,
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
        ctx.effectiveAccountId,
        cost,
        "image_generation",
        `Image generation (${modelId || "default"}, ${imageSize})`,
        ctx.effectivePerformedBy,
        ctx.chatId ? { type: "chat", id: ctx.chatId } : undefined,
        ctx.effectiveAccountType
      );
    }

    const response =
      result.provider === "google"
        ? sanitizeGeminiResponse(result.response)
        : result.provider === "openai"
          ? sanitizeOpenAIResponse(result.response)
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

    const imagePart: MessageContentPart = isVideoSuggest
      ? {
          type: "agent_video_suggest",
          imageId: finalImageId,
          imageUrl: getSignedImageUrl(finalImageId, undefined, ctx.cnMode),
          title: suggestion.title,
          aspectRatio,
          prompt: suggestion.prompt,
          videoIdea: suggestion.videoIdea || "",
          status: "generated",
        }
      : {
          type: "agent_image",
          imageId: finalImageId,
          imageUrl: getSignedImageUrl(finalImageId, undefined, ctx.cnMode),
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
