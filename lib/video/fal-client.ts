/**
 * Fal AI Client Wrapper
 *
 * Provides a clean interface for submitting video generation jobs
 * using Fal's queue system with webhooks for completion notification.
 */

import { fal } from "@fal-ai/client";

// Configure fal client with credentials
fal.config({
  credentials: process.env.FAL_API_KEY,
});

export interface SubmitVideoGenerationResult {
  requestId: string;
}

/**
 * Submit a video generation job to Fal's queue with webhook callback
 *
 * @param modelId The Fal model ID (e.g., "fal-ai/bytedance/seedance/v1.5/pro/image-to-video")
 * @param params The input parameters for the model
 * @param webhookUrl The URL that Fal will POST to when generation completes
 * @returns The request ID for tracking
 */
export async function submitVideoGeneration(
  modelId: string,
  params: Record<string, any>,
  webhookUrl: string
): Promise<SubmitVideoGenerationResult> {
  const result = await fal.queue.submit(modelId, {
    input: params,
    webhookUrl,
  });

  return {
    requestId: result.request_id,
  };
}

/**
 * Check the status of a video generation job
 *
 * @param modelId The Fal model ID
 * @param requestId The request ID returned from submitVideoGeneration
 * @returns The current status of the job
 */
export async function getVideoGenerationStatus(
  modelId: string,
  requestId: string
) {
  return await fal.queue.status(modelId, {
    requestId,
    logs: true,
  });
}

/**
 * Get the result of a completed video generation job
 *
 * @param modelId The Fal model ID
 * @param requestId The request ID returned from submitVideoGeneration
 * @returns The generation result including video URL
 */
export async function getVideoGenerationResult(
  modelId: string,
  requestId: string
) {
  return await fal.queue.result(modelId, {
    requestId,
  });
}

/**
 * Video generation result structure from Seedance model
 */
export interface SeedanceVideoResult {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
  seed: number;
}

/**
 * Webhook payload structure from Fal
 */
export interface FalWebhookPayload {
  request_id: string;
  gateway_request_id: string;
  status: "OK" | "ERROR";
  payload?: SeedanceVideoResult | null;
  error?: string;
  payload_error?: string;
}

/**
 * Fal queue status response
 */
export interface FalQueueStatus {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  logs?: Array<{ message: string; timestamp: string }>;
}

/**
 * Try to recover a video generation result directly from Fal's queue
 * Used when webhook might have failed
 *
 * @param modelId The Fal model ID
 * @param requestId The Fal request ID
 * @returns The result if completed, null if still in progress, or throws on error
 */
export async function tryRecoverVideoGeneration(
  modelId: string,
  requestId: string
): Promise<{ status: "completed" | "in_progress" | "failed"; result?: SeedanceVideoResult; error?: string }> {
  try {
    // First check the status
    const statusResponse = await fal.queue.status(modelId, {
      requestId,
      logs: false,
    }) as FalQueueStatus;

    if (statusResponse.status === "IN_QUEUE" || statusResponse.status === "IN_PROGRESS") {
      return { status: "in_progress" };
    }

    if (statusResponse.status === "FAILED") {
      return { status: "failed", error: "Generation failed on Fal" };
    }

    if (statusResponse.status === "COMPLETED") {
      // Get the result
      const resultResponse = await fal.queue.result(modelId, {
        requestId,
      });

      // Type assertion - the result structure matches SeedanceVideoResult
      const result = resultResponse.data as SeedanceVideoResult;

      if (!result?.video?.url) {
        return { status: "failed", error: "No video URL in result" };
      }

      return { status: "completed", result };
    }

    return { status: "failed", error: `Unknown status: ${statusResponse.status}` };
  } catch (error: any) {
    console.error("[Fal Recovery] Error recovering generation:", error);
    return { status: "failed", error: error.message || "Failed to recover from Fal" };
  }
}
