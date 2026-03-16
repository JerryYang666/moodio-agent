import { fal } from "@fal-ai/client";
import type { VideoProviderClient, VideoGenerationResult } from "./index";

fal.config({
  credentials: process.env.FAL_API_KEY,
});

interface FalQueueStatus {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  logs?: Array<{ message: string; timestamp: string }>;
}

export class FalVideoProvider implements VideoProviderClient {
  async submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string }> {
    const result = await fal.queue.submit(providerModelId, {
      input: params,
      webhookUrl,
    });
    return { requestId: result.request_id };
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
