import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getVideoModel,
  validateAndMergeParams,
  DEFAULT_VIDEO_MODEL_ID,
  TEXT_TO_VIDEO_PLACEHOLDER_IMAGE_ID,
} from "@/lib/video/models";
import { deductCredits, assertSufficientCredits, getActiveAccount, InsufficientCreditsError } from "@/lib/credits";
import { calculateCost } from "@/lib/pricing";
import { submitVideoGeneration } from "@/lib/video/video-client";
import { getSignedImageUrl } from "@/lib/storage/s3";
import { recordEvent } from "@/lib/telemetry";
import { isFeatureFlagEnabled } from "@/lib/feature-flags/server";
import { recordResearchEvent } from "@/lib/research-telemetry";

/**
 * POST /api/video/generate
 * Start a video generation job
 *
 * Request body:
 * - modelId: string (optional, defaults to DEFAULT_VIDEO_MODEL_ID)
 * - sourceImageId: string (required) - The image ID to use as first frame
 * - endImageId: string (optional) - The image ID to use as last frame
 * - params: object - Model-specific parameters (prompt, aspect_ratio, etc.)
 */
export async function POST(request: NextRequest) {
  // Verify authentication
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const account = await getActiveAccount(payload.userId, payload);

  const ipAddress =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    undefined;

  try {
    const body = await request.json();
    const {
      modelId = DEFAULT_VIDEO_MODEL_ID,
      sourceImageId,
      endImageId,
      params = {},
    } = body;

    // Validate model exists
    const model = getVideoModel(modelId);
    if (!model) {
      return NextResponse.json(
        { error: `Unknown video model: ${modelId}` },
        { status: 400 }
      );
    }

    // Validate required source image (only for image-to-video models)
    const isTextToVideo = !model.imageParams;

    if (!isTextToVideo && !sourceImageId) {
      return NextResponse.json(
        { error: "sourceImageId is required for this model" },
        { status: 400 }
      );
    }

    // Build the full params with image URLs
    const fullParams = { ...params };
    if (!isTextToVideo && sourceImageId) {
      fullParams[model.imageParams!.sourceImage] = getSignedImageUrl(sourceImageId);
      if (endImageId && model.imageParams!.endImage) {
        fullParams[model.imageParams!.endImage] = getSignedImageUrl(endImageId);
      }
    }

    // Sign image IDs for type: "asset" params
    for (const param of model.params) {
      if (param.type === "asset" && typeof fullParams[param.name] === "string" && fullParams[param.name]) {
        fullParams[param.name] = getSignedImageUrl(fullParams[param.name]);
      }
    }

    // Resolve image IDs inside kling_elements to signed URLs for the provider API
    if (Array.isArray(fullParams.kling_elements)) {
      fullParams.kling_elements = fullParams.kling_elements.map(
        (el: { name: string; description: string; element_input_ids?: string[]; element_input_urls?: string[] }) => ({
          name: el.name,
          description: el.description,
          element_input_urls: (el.element_input_ids || el.element_input_urls || []).map((idOrUrl: string) => {
            if (idOrUrl.startsWith("http") && !idOrUrl.includes("moodio.art/images/")) {
              return idOrUrl;
            }
            const cfMatch = idOrUrl.match(/\/images\/([^/?]+)/);
            if (cfMatch) {
              return getSignedImageUrl(cfMatch[1]);
            }
            return getSignedImageUrl(idOrUrl);
          }),
        })
      );
    }

    const effectiveSourceImageId = isTextToVideo
      ? TEXT_TO_VIDEO_PLACEHOLDER_IMAGE_ID
      : sourceImageId;

    // Validate and merge with defaults
    let mergedParams: Record<string, any>;
    try {
      mergedParams = validateAndMergeParams(modelId, fullParams);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || "Invalid parameters" },
        { status: 400 }
      );
    }

    // Calculate cost from pricing formula
    const cost = await calculateCost(modelId, mergedParams);

    // Check balance before doing any work
    try {
      await assertSufficientCredits(account.accountId, cost, account.accountType);
    } catch (error: any) {
      if (
        error.message === "INSUFFICIENT_CREDITS" ||
        error instanceof InsufficientCreditsError
      ) {
        await recordEvent(
          "video_generation",
          payload.userId,
          { status: "insufficient_credits", modelId, cost },
          ipAddress
        );
        return NextResponse.json(
          { error: "INSUFFICIENT_CREDITS", cost },
          { status: 402 }
        );
      }
      throw error;
    }

    // Build webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Create generation record (no credit deduction yet)
    const [generation] = await db
      .insert(videoGenerations)
      .values({
        userId: payload.userId,
        modelId,
        status: "pending",
        sourceImageId: effectiveSourceImageId,
        endImageId: endImageId || null,
        params: mergedParams,
      })
      .returning();

    // Submit to provider
    try {
      const { requestId, provider, providerModelId } = await submitVideoGeneration(
        modelId,
        mergedParams,
        baseUrl
      );

      // Submission succeeded — deduct credits and update record atomically
      await db.transaction(async (tx) => {
        await deductCredits(
          account.accountId,
          cost,
          "video_generation",
          `Generated video with model ${model.name}`,
          account.performedBy,
          { type: "video_generation", id: generation.id },
          account.accountType,
          tx
        );

        await tx
          .update(videoGenerations)
          .set({
            providerRequestId: requestId,
            provider,
            providerModelId,
            status: "processing",
          })
          .where(eq(videoGenerations.id, generation.id));
      });

      await recordEvent(
        "video_generation",
        payload.userId,
        {
          status: "submitted",
          generationId: generation.id,
          providerRequestId: requestId,
          modelId,
          sourceImageId: effectiveSourceImageId,
          endImageId: endImageId || null,
          params: mergedParams,
          cost,
        },
        ipAddress
      );

      // Research telemetry
      if (await isFeatureFlagEnabled(payload.userId, "res_telemetry")) {
        recordResearchEvent({
          userId: payload.userId,
          eventType: "video_generation_started",
          imageId: effectiveSourceImageId,
          metadata: {
            modelId,
            modelName: model.name,
            prompt: params.prompt,
            cost,
          },
        });
      }

      return NextResponse.json({
        success: true,
        generationId: generation.id,
        providerRequestId: requestId,
        status: "processing",
      });
    } catch (submitError: any) {
      console.error("[Video Generate] Provider submission error:", submitError);

      // Mark generation as failed (no credits to refund)
      await db
        .update(videoGenerations)
        .set({
          status: "failed",
          error: submitError.message || "Failed to submit to provider",
          completedAt: new Date(),
        })
        .where(eq(videoGenerations.id, generation.id));

      await recordEvent(
        "video_generation",
        payload.userId,
        {
          status: "submission_failed",
          generationId: generation.id,
          modelId,
          error: submitError.message || "Failed to submit to provider",
        },
        ipAddress
      );

      return NextResponse.json(
        { error: "Failed to start video generation" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[Video Generate] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
