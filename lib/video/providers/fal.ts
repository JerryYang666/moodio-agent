import { fal } from "@fal-ai/client";
import type { VideoProviderClient, VideoGenerationResult } from "./index";

fal.config({
  credentials: process.env.FAL_API_KEY,
});

interface FalQueueStatus {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  logs?: Array<{ message: string; timestamp: string }>;
}

// ---------------------------------------------------------------------------
// Seedance 2.0 dynamic endpoint routing
// ---------------------------------------------------------------------------

const SEEDANCE2_BASES = new Set([
  "bytedance/seedance-2.0",
  "bytedance/seedance-2.0/fast",
]);

/**
 * For Seedance 2.0 models, resolve the actual Fal sub-endpoint
 * (text-to-video / image-to-video / reference-to-video) based on
 * which media params are present. Non-Seedance models pass through.
 */
function resolveFalEndpoint(
  providerModelId: string,
  params: Record<string, any>
): { endpoint: string; input: Record<string, any> } {
  if (!SEEDANCE2_BASES.has(providerModelId)) {
    return { endpoint: providerModelId, input: params };
  }

  const { media_references, image_url, web_search, ...rest } = params;

  if (rest.aspect_ratio === "adaptive") rest.aspect_ratio = "auto";

  if (Array.isArray(media_references) && media_references.length > 0) {
    const imageUrls = media_references
      .filter((r: any) => r.type === "image")
      .map((r: any) => r.id);
    const videoUrls = media_references
      .filter((r: any) => r.type === "video")
      .map((r: any) => r.id);
    return {
      endpoint: `${providerModelId}/reference-to-video`,
      input: {
        ...rest,
        ...(imageUrls.length > 0 && { image_urls: imageUrls }),
        ...(videoUrls.length > 0 && { video_urls: videoUrls }),
      },
    };
  }

  if (image_url) {
    return {
      endpoint: `${providerModelId}/image-to-video`,
      input: { ...rest, image_url },
    };
  }

  return {
    endpoint: `${providerModelId}/text-to-video`,
    input: rest,
  };
}

// ---------------------------------------------------------------------------

export class FalVideoProvider implements VideoProviderClient {
  async submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string; providerModelId?: string }> {
    const { endpoint, input } = resolveFalEndpoint(providerModelId, params);
    const result = await fal.queue.submit(endpoint, {
      input,
      webhookUrl,
    });
    return {
      requestId: result.request_id,
      ...(endpoint !== providerModelId && { providerModelId: endpoint }),
    };
  }

  async getStatus(
    providerModelId: string,
    requestId: string
  ): Promise<{ status: "in_queue" | "in_progress" | "completed" | "failed" }> {
    const response = (await fal.queue.status(providerModelId, {
      requestId,
      logs: true,
    })) as FalQueueStatus;

    const statusMap: Record<string, "in_queue" | "in_progress" | "completed" | "failed"> = {
      IN_QUEUE: "in_queue",
      IN_PROGRESS: "in_progress",
      COMPLETED: "completed",
      FAILED: "failed",
    };
    return { status: statusMap[response.status] ?? "failed" };
  }

  async getResult(
    providerModelId: string,
    requestId: string
  ): Promise<{ data: any }> {
    return await fal.queue.result(providerModelId, { requestId });
  }

  async tryRecover(
    providerModelId: string,
    requestId: string
  ): Promise<{
    status: "completed" | "in_progress" | "failed";
    result?: VideoGenerationResult;
    error?: string;
  }> {
    try {
      const statusResponse = (await fal.queue.status(providerModelId, {
        requestId,
        logs: false,
      })) as FalQueueStatus;

      if (
        statusResponse.status === "IN_QUEUE" ||
        statusResponse.status === "IN_PROGRESS"
      ) {
        return { status: "in_progress" };
      }

      if (statusResponse.status === "FAILED") {
        return { status: "failed", error: "Generation failed on Fal" };
      }

      if (statusResponse.status === "COMPLETED") {
        const resultResponse = await fal.queue.result(providerModelId, {
          requestId,
        });
        const result = resultResponse.data as VideoGenerationResult;

        if (!result?.video?.url) {
          return { status: "failed", error: "No video URL in result" };
        }
        return { status: "completed", result };
      }

      return {
        status: "failed",
        error: `Unknown status: ${statusResponse.status}`,
      };
    } catch (error: any) {
      console.error("[Fal Recovery] Error recovering generation:", error);
      return {
        status: "failed",
        error: error.message || "Failed to recover from Fal",
      };
    }
  }
}
