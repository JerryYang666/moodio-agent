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
 * Download a generated video, upload to S3, extract a thumbnail if needed,
 * and update the generation row to `completed`. Shared between the normal
 * webhook success path and admin manual recovery.
 *
 * Does NOT touch credits. The caller decides whether to refund on failure
 * (webhook path) or to leave credits untouched (recovery path for a
 * generation that was already refunded after a transient download failure).
 *
 * Throws on any error so the caller can decide how to handle it.
 */
export async function downloadAndPersistVideo(
  generationId: string,
  result: VideoGenerationResult,
  logPrefix: string = "[Webhook]"
): Promise<{ videoId: string }> {
  console.log(`${logPrefix} Processing video for generation ${generationId}`);

  const videoBuffer = await downloadFromUrl(result.video.url);
  console.log(`${logPrefix} Downloaded video: ${videoBuffer.length} bytes`);

  const videoId = generateVideoId();
  const thumbnailId = generateImageId();

  const contentType = result.video.content_type || "video/mp4";
  await uploadVideo(videoBuffer, contentType, videoId);
  console.log(`${logPrefix} Uploaded video as ${videoId}`);

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
      console.log(
        `${logPrefix} Extracted first frame for text-to-video: ${frameImageId}`
      );
    } catch (frameError) {
      console.error(
        `${logPrefix} First-frame extraction failed, keeping placeholder:`,
        frameError
      );
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
      error: null,
      completedAt: new Date(),
    })
    .where(eq(videoGenerations.id, generationId));

  return { videoId };
}

/**
 * Handle a successful video generation result.
 * Downloads the video, uploads to S3, updates DB. Refunds on failure.
 */
export async function processVideoResult(
  generationId: string,
  result: VideoGenerationResult
) {
  try {
    const { videoId } = await downloadAndPersistVideo(
      generationId,
      result,
      "[Webhook]"
    );

    const [generation] = await db
      .select({
        userId: videoGenerations.userId,
        modelId: videoGenerations.modelId,
      })
      .from(videoGenerations)
      .where(eq(videoGenerations.id, generationId))
      .limit(1);

    await recordEvent("video_generation", generation?.userId, {
      status: "completed",
      generationId,
      modelId: generation?.modelId,
      videoId,
      seed: result.seed,
    });

    // If this generation targets a group folder, attach the resulting video
    // as a member. Best-effort — we never fail the webhook on group attach
    // errors (the asset is already saved via the standard pipeline).
    try {
      const { attachVideoToGroup } = await import("@/lib/groups/service");
      await attachVideoToGroup(generationId);
    } catch (groupErr) {
      console.error(
        `[Webhook] attachVideoToGroup failed for ${generationId}:`,
        groupErr
      );
    }

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
