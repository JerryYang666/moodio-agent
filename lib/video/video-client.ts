/**
 * Video Provider Facade
 *
 * Provider-agnostic interface for video generation. Resolves the active
 * provider for each model and delegates to the appropriate provider client.
 *
 * Function signatures accept the display modelId so all existing callers
 * remain unchanged.
 */

import { getActiveProvider, applyParamMapping } from "./provider-config";
import { getProviderClient, type VideoGenerationResult } from "./providers";
import type { VideoProvider } from "./models";

export type { VideoGenerationResult };

export interface SubmitVideoGenerationResult {
  requestId: string;
  provider: string;
  providerModelId: string;
}

/**
 * Webhook payload structure from Fal.
 * Kept here for backward compatibility with existing webhook handler imports.
 */
export interface FalWebhookPayload {
  request_id: string;
  gateway_request_id: string;
  status: "OK" | "ERROR";
  payload?: VideoGenerationResult | null;
  error?: string;
  payload_error?: string;
}

export { type VideoGenerationResult as SeedanceVideoResult };

/**
 * Build the provider-specific webhook URL.
 */
function getWebhookUrl(baseUrl: string, provider: VideoProvider): string {
  return `${baseUrl}/api/video/webhook/${provider}`;
}

/**
 * Submit a video generation job via the active provider for the given model.
 *
 * @param modelId The display model ID (e.g., "kling-v2.6-pro")
 * @param params The input parameters for the model
 * @param baseUrl The app's base URL (used to construct provider-specific webhook URL)
 * @returns The request ID and provider info for tracking
 */
export async function submitVideoGeneration(
  modelId: string,
  params: Record<string, any>,
  baseUrl: string
): Promise<SubmitVideoGenerationResult> {
  const variant = getActiveProvider(modelId);
  const client = getProviderClient(variant.provider);
  const mappedParams = applyParamMapping(params, variant.paramMapping);
  const webhookUrl = getWebhookUrl(baseUrl, variant.provider);

  const result = await client.submitGeneration(
    variant.providerModelId,
    mappedParams,
    webhookUrl
  );

  return {
    requestId: result.requestId,
    provider: variant.provider,
    providerModelId: result.providerModelId ?? variant.providerModelId,
  };
}

/**
 * Check the status of a video generation job.
 * Uses stored provider info to route to the correct provider.
 */
export async function getVideoGenerationStatus(
  provider: string,
  providerModelId: string,
  requestId: string
) {
  const client = getProviderClient(provider as any);
  return await client.getStatus(providerModelId, requestId);
}

/**
 * Get the result of a completed video generation job.
 * Uses stored provider info to route to the correct provider.
 */
export async function getVideoGenerationResult(
  provider: string,
  providerModelId: string,
  requestId: string
) {
  const client = getProviderClient(provider as any);
  return await client.getResult(providerModelId, requestId);
}

/**
 * Try to recover a video generation result directly from the provider's queue.
 * Used when webhook might have failed.
 * Uses stored provider info to route to the correct provider.
 */
export async function tryRecoverVideoGeneration(
  provider: string,
  providerModelId: string,
  requestId: string
): Promise<{
  status: "completed" | "in_progress" | "failed";
  result?: VideoGenerationResult;
  error?: string;
}> {
  const client = getProviderClient(provider as any);
  return await client.tryRecover(providerModelId, requestId);
}
