import type { VideoProviderClient, VideoGenerationResult } from "./index";

/**
 * Kie video provider - stub implementation.
 * Replace with actual kie SDK/API calls when available.
 */
export class KieVideoProvider implements VideoProviderClient {
  async submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string }> {
    // TODO: Replace with actual kie API call
    throw new Error(
      `Kie provider not yet implemented (model: ${providerModelId})`
    );
  }

  async getStatus(
    providerModelId: string,
    requestId: string
  ): Promise<{ status: "in_queue" | "in_progress" | "completed" | "failed" }> {
    throw new Error(
      `Kie provider not yet implemented (model: ${providerModelId})`
    );
  }

  async getResult(
    providerModelId: string,
    requestId: string
  ): Promise<{ data: any }> {
    throw new Error(
      `Kie provider not yet implemented (model: ${providerModelId})`
    );
  }

  async tryRecover(
    providerModelId: string,
    requestId: string
  ): Promise<{
    status: "completed" | "in_progress" | "failed";
    result?: VideoGenerationResult;
    error?: string;
  }> {
    return {
      status: "failed",
      error: `Kie provider not yet implemented (model: ${providerModelId})`,
    };
  }
}
