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
} from "@/lib/video/models";
import { deductCredits, assertSufficientCredits, InsufficientCreditsError } from "@/lib/credits";
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

    // Validate required source image
    if (!sourceImageId) {
      return NextResponse.json(
        { error: "sourceImageId is required" },
        { status: 400 }
      );
    }

    // Build the full params with image URLs
    const fullParams = {
      ...params,
      [model.imageParams.sourceImage]: getSignedImageUrl(sourceImageId),
    };

    // Add end image if provided and model supports it
    if (endImageId && model.imageParams.endImage) {
      fullParams[model.imageParams.endImage] = getSignedImageUrl(endImageId);
    }

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
      await assertSufficientCredits(payload.userId, cost);
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
        sourceImageId,
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
          payload.userId,
          cost,
          "video_generation",
          `Generated video with model ${model.name}`,
          { type: "video_generation", id: generation.id },
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
          sourceImageId,
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
          imageId: sourceImageId,
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
