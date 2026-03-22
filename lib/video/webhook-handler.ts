/**
 * Shared Webhook Processing Logic
 *
 * Provider-agnostic functions for handling webhook callbacks.
 * Each provider's webhook route verifies its own signature, parses
 * its own payload format, then delegates to these shared functions.
 */

import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { refundCharge } from "@/lib/credits";
import {
  uploadVideo,
  downloadFromUrl,
  generateVideoId,
  generateImageId,
} from "@/lib/storage/s3";
import { recordEvent } from "@/lib/telemetry";
import type { VideoGenerationResult } from "./providers";
import { TEXT_TO_VIDEO_PLACEHOLDER_IMAGE_ID } from "./models";
import { extractFirstFrameViaLambda } from "./frame-extract";

/**
 * Look up a generation by its provider request ID.
 * Returns null if not found.
 */
export async function findGenerationByRequestId(requestId: string) {
  const [generation] = await db
    .select()
    .from(videoGenerations)
    .where(eq(videoGenerations.providerRequestId, requestId))
    .limit(1);
  return generation ?? null;
}

/**
 * Check if a generation has already reached a terminal state.
 */
export function isTerminal(generation: { status: string }): boolean {
  return generation.status === "completed" || generation.status === "failed";
}

/**
 * Handle a successful video generation result.
 * Downloads the video, uploads to S3, updates DB.
 */
export async function processVideoResult(
  generationId: string,
  result: VideoGenerationResult
) {
  try {
    console.log(`[Webhook] Processing video for generation ${generationId}`);

    const videoBuffer = await downloadFromUrl(result.video.url);
    console.log(`[Webhook] Downloaded video: ${videoBuffer.length} bytes`);

    const videoId = generateVideoId();
    const thumbnailId = generateImageId();

    const contentType = result.video.content_type || "video/mp4";
    await uploadVideo(videoBuffer, contentType, videoId);
    console.log(`[Webhook] Uploaded video as ${videoId}`);

    const [generation] = await db
      .select()
      .from(videoGenerations)
      .where(eq(videoGenerations.id, generationId))
      .limit(1);

    let effectiveSourceImageId = generation?.sourceImageId;
    let effectiveThumbnailId = generation?.sourceImageId || thumbnailId;

    if (generation?.sourceImageId === TEXT_TO_VIDEO_PLACEHOLDER_IMAGE_ID) {
      try {
        const frameImageId = generateImageId();
        await extractFirstFrameViaLambda(videoId, frameImageId);
        effectiveSourceImageId = frameImageId;
        effectiveThumbnailId = frameImageId;
        console.log(`[Webhook] Extracted first frame for text-to-video: ${frameImageId}`);
      } catch (frameError) {
        console.error(`[Webhook] First-frame extraction failed, keeping placeholder:`, frameError);
      }
    }

    await db
      .update(videoGenerations)
      .set({
        status: "completed",
        videoId,
        sourceImageId: effectiveSourceImageId,
        thumbnailImageId: effectiveThumbnailId,
        seed: result.seed,
        completedAt: new Date(),
      })
      .where(eq(videoGenerations.id, generationId));

    await recordEvent("video_generation", generation?.userId, {
      status: "completed",
      generationId,
      modelId: generation?.modelId,
      videoId,
      seed: result.seed,
    });

    console.log(`[Webhook] Generation ${generationId} completed successfully`);
  } catch (error) {
    console.error(
      `[Webhook] Error processing video for ${generationId}:`,
      error
    );

    const [gen] = await db
      .select({
        userId: videoGenerations.userId,
        modelId: videoGenerations.modelId,
      })
      .from(videoGenerations)
      .where(eq(videoGenerations.id, generationId))
      .limit(1);

    const errorMsg =
      error instanceof Error ? error.message : "Failed to process video";

    await refundGeneration(generationId, gen?.userId, errorMsg);

    await recordEvent("video_generation", gen?.userId, {
      status: "failed",
      generationId,
      modelId: gen?.modelId,
      error: errorMsg,
    });
  }
}

/**
 * Handle a failed generation -- refund credits and mark as failed.
 */
export async function handleGenerationFailure(
  generationId: string,
  userId: string | undefined,
  modelId: string | undefined,
  errorMsg: string
) {
  await refundGeneration(generationId, userId, errorMsg);

  await recordEvent("video_generation", userId, {
    status: "failed",
    generationId,
    modelId,
    error: errorMsg,
  });
}

/**
 * Refund credits to user on failure by looking up the original charge.
 */
export async function refundGeneration(
  generationId: string,
  userId: string | undefined,
  reason: string
) {
  try {
    const refundedAmount = await db.transaction(async (tx) => {
      const amount = await refundCharge(
        { type: "video_generation", id: generationId },
        `Refund: ${reason}`,
        tx
      );

      await tx
        .update(videoGenerations)
        .set({
          status: "failed",
          error: reason,
          completedAt: new Date(),
        })
        .where(eq(videoGenerations.id, generationId));

      return amount;
    });

    if (refundedAmount) {
      console.log(
        `[Refund] Refunded ${refundedAmount} credits for generation ${generationId}`
      );
      await recordEvent("video_generation_refund", userId, {
        status: "refunded",
        generationId,
        reason,
        refundedAmount,
      });
    } else {
      console.warn(
        `[Refund] No charge found to refund for generation ${generationId}`
      );
    }
  } catch (error) {
    console.error(
      `[Refund] Failed to refund generation ${generationId}:`,
      error
    );

    await recordEvent("video_generation_refund", userId, {
      status: "refund_failed",
      generationId,
      reason,
      error: error instanceof Error ? error.message : "Unknown refund error",
    });

    try {
      await db
        .update(videoGenerations)
        .set({
          status: "failed",
          error: `Refund failed: ${reason}`,
          completedAt: new Date(),
        })
        .where(eq(videoGenerations.id, generationId));
    } catch (e) {
      console.error(
        "Failed to update generation status after failed refund",
        e
      );
    }
  }
}
