import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { refundCharge } from "@/lib/credits";
import {
  verifyFalWebhook,
  extractWebhookHeaders,
  shouldSkipVerification,
} from "@/lib/video/webhook-verify";
import {
  uploadImage,
  uploadVideo,
  downloadFromUrl,
  generateVideoId,
  generateImageId,
} from "@/lib/storage/s3";
import { FalWebhookPayload, SeedanceVideoResult } from "@/lib/video/fal-client";
import { waitUntil } from "@vercel/functions";

/**
 * POST /api/video/webhook
 * Receives completion callbacks from Fal AI
 *
 * This endpoint is called by Fal when a video generation job completes.
 * It verifies the signature, downloads the video, creates a thumbnail,
 * and updates the database.
 */
export async function POST(request: NextRequest) {
  // Get raw body for signature verification
  const bodyBuffer = Buffer.from(await request.arrayBuffer());
  const headers = extractWebhookHeaders(request.headers);

  // Verify webhook signature (skip in development if configured)
  if (!shouldSkipVerification()) {
    const isValid = await verifyFalWebhook(headers, bodyBuffer);
    if (!isValid) {
      console.error("[Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[Webhook] Skipping signature verification in development");
  }

  // Parse payload
  let payload: FalWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf-8"));
  } catch (e) {
    console.error("[Webhook] Failed to parse payload:", e);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { request_id: falRequestId, status, payload: resultPayload, error, payload_error } = payload;

  console.log(`[Webhook] Received callback for request ${falRequestId}, status: ${status}`);

  // Find the generation record
  const [generation] = await db
    .select()
    .from(videoGenerations)
    .where(eq(videoGenerations.falRequestId, falRequestId))
    .limit(1);

  if (!generation) {
    console.error(`[Webhook] Generation not found for request ${falRequestId}`);
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 }
    );
  }

  // Check if already completed (e.g., by recovery process)
  if (generation.status === "completed" || generation.status === "failed") {
    console.log(`[Webhook] Generation ${generation.id} already ${generation.status}, skipping`);
    return NextResponse.json({ received: true, status: "already_processed" });
  }

  // Handle error status
  if (status === "ERROR") {
    const errorMsg = error || payload_error || "Unknown error from Fal";
    
    // Refund user by looking up original charge
    await refundGeneration(generation.id, errorMsg);

    console.error(`[Webhook] Generation ${generation.id} failed:`, errorMsg);
    return NextResponse.json({ received: true, status: "failed" });
  }

  // Handle payload error
  if (payload_error || !resultPayload) {
    const errorMsg = payload_error || "No result payload received";
    
    // Refund user by looking up original charge
    await refundGeneration(generation.id, errorMsg);

    console.error(`[Webhook] Generation ${generation.id} payload error:`, errorMsg);
    return NextResponse.json({ received: true, status: "failed" });
  }

  // Process successful result in background
  // Respond quickly to Fal, then do the heavy lifting
  waitUntil(
    processVideoResult(generation.id, resultPayload as SeedanceVideoResult)
  );

  return NextResponse.json({ received: true, status: "processing" });
}

/**
 * Process the video result - download, create thumbnail, upload to S3
 */
async function processVideoResult(
  generationId: string,
  result: SeedanceVideoResult
) {
  try {
    console.log(`[Webhook] Processing video for generation ${generationId}`);

    // Download video from Fal URL
    const videoBuffer = await downloadFromUrl(result.video.url);
    console.log(`[Webhook] Downloaded video: ${videoBuffer.length} bytes`);

    // Generate IDs
    const videoId = generateVideoId();
    const thumbnailId = generateImageId();

    // Upload video to S3
    const contentType = result.video.content_type || "video/mp4";
    await uploadVideo(videoBuffer, contentType, videoId);
    console.log(`[Webhook] Uploaded video as ${videoId}`);

    // Extract thumbnail (first frame)
    // For now, we'll use the source image as thumbnail since extracting 
    // video frames requires ffmpeg which may not be available
    // In production, you'd want to use a video processing service
    const [generation] = await db
      .select()
      .from(videoGenerations)
      .where(eq(videoGenerations.id, generationId))
      .limit(1);

    // Update database with results
    await db
      .update(videoGenerations)
      .set({
        status: "completed",
        videoId,
        thumbnailImageId: generation?.sourceImageId || thumbnailId, // Use source image as thumbnail
        seed: result.seed,
        completedAt: new Date(),
      })
      .where(eq(videoGenerations.id, generationId));

    console.log(`[Webhook] Generation ${generationId} completed successfully`);
  } catch (error) {
    console.error(`[Webhook] Error processing video for ${generationId}:`, error);

    // Refund by looking up original charge
    await refundGeneration(
      generationId,
      error instanceof Error ? error.message : "Failed to process video"
    );
  }
}

/**
 * Refund credits to user on failure by looking up the original charge
 */
async function refundGeneration(generationId: string, reason: string) {
  try {
    const refundedAmount = await db.transaction(async (tx) => {
      // Refund by looking up the original charge
      const amount = await refundCharge(
        { type: "video_generation", id: generationId },
        `Refund: ${reason}`,
        tx
      );

      // Update generation status
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
      console.log(`[Refund] Refunded ${refundedAmount} credits for generation ${generationId}`);
    } else {
      console.warn(`[Refund] No charge found to refund for generation ${generationId}`);
    }
  } catch (error) {
    console.error(`[Refund] Failed to refund generation ${generationId}:`, error);
    // Ensure generation is marked as failed even if refund fails
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
      console.error("Failed to update generation status after failed refund", e);
    }
  }
}
