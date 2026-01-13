import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import {
  getVideoModel,
  validateAndMergeParams,
  DEFAULT_VIDEO_MODEL_ID,
} from "@/lib/video/models";
import { submitVideoGeneration } from "@/lib/video/fal-client";
import { getSignedImageUrl } from "@/lib/storage/s3";

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

    // Create database record
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

    // Build webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      // Update record to failed status
      await db
        .update(videoGenerations)
        .set({
          status: "failed",
          error: "Server configuration error: Missing base URL",
        })
        .where(
          require("drizzle-orm").eq(videoGenerations.id, generation.id)
        );

      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const webhookUrl = `${baseUrl}/api/video/webhook`;

    // Submit to Fal queue
    try {
      const { requestId } = await submitVideoGeneration(
        modelId,
        mergedParams,
        webhookUrl
      );

      // Update record with Fal request ID
      await db
        .update(videoGenerations)
        .set({
          falRequestId: requestId,
          status: "processing",
        })
        .where(
          require("drizzle-orm").eq(videoGenerations.id, generation.id)
        );

      return NextResponse.json({
        success: true,
        generationId: generation.id,
        falRequestId: requestId,
        status: "processing",
      });
    } catch (falError: any) {
      console.error("[Video Generate] Fal submission error:", falError);

      // Update record to failed status
      await db
        .update(videoGenerations)
        .set({
          status: "failed",
          error: falError.message || "Failed to submit to Fal",
        })
        .where(
          require("drizzle-orm").eq(videoGenerations.id, generation.id)
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
