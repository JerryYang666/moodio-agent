/**
 * Video Generation Recovery
 *
 * Handles recovery of stale video generations where webhooks may have failed.
 * If a generation has been processing for more than 20 minutes, we query
 * Fal's queue directly to get the result.
 */

import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq, and, lt, inArray } from "drizzle-orm";
import { tryRecoverVideoGeneration, SeedanceVideoResult } from "./fal-client";
import {
  uploadVideo,
  downloadFromUrl,
  generateVideoId,
} from "@/lib/storage/s3";
import { recordEvent } from "@/lib/telemetry";

// Stale threshold: 20 minutes
const STALE_THRESHOLD_MS = 20 * 60 * 1000;

/**
 * Find all stale video generations for a user
 * Stale = status is "pending" or "processing" and created more than 20 minutes ago
 */
export async function findStaleGenerations(userId?: string) {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  const conditions = [
    inArray(videoGenerations.status, ["pending", "processing"]),
    lt(videoGenerations.createdAt, staleThreshold),
  ];

  if (userId) {
    conditions.push(eq(videoGenerations.userId, userId));
  }

  const staleGens = await db
    .select()
    .from(videoGenerations)
    .where(and(...conditions));

  return staleGens;
}

/**
 * Process the video result - download and upload to S3
 */
async function processVideoResult(
  generationId: string,
  result: SeedanceVideoResult
): Promise<{ videoId: string }> {
  console.log(`[Recovery] Processing video for generation ${generationId}`);

  // Download video from Fal URL
  const videoBuffer = await downloadFromUrl(result.video.url);
  console.log(`[Recovery] Downloaded video: ${videoBuffer.length} bytes`);

  // Generate ID and upload
  const videoId = generateVideoId();
  const contentType = result.video.content_type || "video/mp4";
  await uploadVideo(videoBuffer, contentType, videoId);
  console.log(`[Recovery] Uploaded video as ${videoId}`);

  return { videoId };
}

/**
 * Try to recover a single stale generation
 */
export async function recoverGeneration(generation: {
  id: string;
  userId: string;
  modelId: string;
  falRequestId: string | null;
  sourceImageId: string;
}): Promise<{ recovered: boolean; status: string; error?: string }> {
  // Re-check current status to avoid race condition with webhook
  const [currentGen] = await db
    .select({ status: videoGenerations.status })
    .from(videoGenerations)
    .where(eq(videoGenerations.id, generation.id))
    .limit(1);

  if (!currentGen) {
    return { recovered: false, status: "not_found", error: "Generation not found" };
  }

  if (currentGen.status === "completed" || currentGen.status === "failed") {
    console.log(`[Recovery] Generation ${generation.id} already ${currentGen.status}, skipping`);
    return { recovered: false, status: currentGen.status };
  }

  if (!generation.falRequestId) {
    // No Fal request ID - can't recover
    await db
      .update(videoGenerations)
      .set({
        status: "failed",
        error: "No Fal request ID - cannot recover",
        completedAt: new Date(),
      })
      .where(eq(videoGenerations.id, generation.id));

    await recordEvent("video_generation_recovery", generation.userId, {
      status: "failed",
      generationId: generation.id,
      modelId: generation.modelId,
      error: "No Fal request ID",
    });

    return { recovered: false, status: "failed", error: "No Fal request ID" };
  }

  console.log(`[Recovery] Attempting to recover generation ${generation.id} (Fal: ${generation.falRequestId})`);

  try {
    const recoveryResult = await tryRecoverVideoGeneration(
      generation.modelId,
      generation.falRequestId
    );

    if (recoveryResult.status === "in_progress") {
      // Still running - not actually stale, just slow
      console.log(`[Recovery] Generation ${generation.id} is still in progress`);
      return { recovered: false, status: "in_progress" };
    }

    if (recoveryResult.status === "failed") {
      await db
        .update(videoGenerations)
        .set({
          status: "failed",
          error: recoveryResult.error || "Failed during recovery check",
          completedAt: new Date(),
        })
        .where(eq(videoGenerations.id, generation.id));

      await recordEvent("video_generation_recovery", generation.userId, {
        status: "failed",
        generationId: generation.id,
        modelId: generation.modelId,
        error: recoveryResult.error || "Failed during recovery check",
      });

      console.log(`[Recovery] Generation ${generation.id} failed: ${recoveryResult.error}`);
      return { recovered: true, status: "failed", error: recoveryResult.error };
    }

    if (recoveryResult.status === "completed" && recoveryResult.result) {
      // Success! Process and save the video
      const { videoId } = await processVideoResult(generation.id, recoveryResult.result);

      await db
        .update(videoGenerations)
        .set({
          status: "completed",
          videoId,
          thumbnailImageId: generation.sourceImageId, // Use source as thumbnail
          seed: recoveryResult.result.seed,
          completedAt: new Date(),
        })
        .where(eq(videoGenerations.id, generation.id));

      await recordEvent("video_generation_recovery", generation.userId, {
        status: "completed",
        generationId: generation.id,
        modelId: generation.modelId,
      });

      console.log(`[Recovery] Successfully recovered generation ${generation.id}`);
      return { recovered: true, status: "completed" };
    }

    return { recovered: false, status: "unknown" };
  } catch (error: any) {
    console.error(`[Recovery] Error recovering generation ${generation.id}:`, error);

    await db
      .update(videoGenerations)
      .set({
        status: "failed",
        error: `Recovery failed: ${error.message || "Unknown error"}`,
        completedAt: new Date(),
      })
      .where(eq(videoGenerations.id, generation.id));

    await recordEvent("video_generation_recovery", generation.userId, {
      status: "failed",
      generationId: generation.id,
      modelId: generation.modelId,
      error: error.message || "Unknown error",
    });

    return { recovered: true, status: "failed", error: error.message };
  }
}

/**
 * Check and recover all stale generations for a user
 * Returns the number of generations recovered
 */
export async function checkAndRecoverStaleGenerations(userId?: string): Promise<{
  checked: number;
  recovered: number;
  stillProcessing: number;
  failed: number;
}> {
  const staleGens = await findStaleGenerations(userId);

  const results = {
    checked: staleGens.length,
    recovered: 0,
    stillProcessing: 0,
    failed: 0,
  };

  if (staleGens.length === 0) {
    return results;
  }

  console.log(`[Recovery] Found ${staleGens.length} stale generations to check`);

  for (const gen of staleGens) {
    const result = await recoverGeneration(gen);

    if (result.status === "in_progress") {
      results.stillProcessing++;
    } else if (result.status === "completed") {
      results.recovered++;
    } else {
      results.failed++;
    }
  }

  console.log(`[Recovery] Results: ${results.recovered} recovered, ${results.stillProcessing} still processing, ${results.failed} failed`);

  return results;
}
