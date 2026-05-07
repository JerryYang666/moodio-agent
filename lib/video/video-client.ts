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
  /**
   * IDs the KSyun provider freshly minted for library elements on this submit.
   * The /api/video/generate route persists these onto the corresponding
   * `collection_images.element_details.ksyunElementId` so the next submission
   * skips the create-and-poll round trip. Empty/undefined for non-KSyun
   * submissions and for KSyun submissions where every element was a cache hit.
   */
  ksyunElementWriteBacks?: Array<{
    libraryElementId: string;
    ksyunElementId: number;
  }>;
}

/**
 * Webhook payload structure from Fal.
 * Kept here for backward compatibility with existing webhook handler imports.
 */
export interface FalWebhookPayload {
  request_id: string;
  gateway_request_id: string;
  status: "OK" | "ERROR";
  payload?: (VideoGenerationResult & { detail?: FalErrorDetail[] }) | null;
  error?: string;
  payload_error?: string;
}

export interface FalErrorDetail {
  msg?: string;
  type?: string;
  loc?: string[];
  input?: Record<string, unknown>;
  ctx?: Record<string, unknown>;
  url?: string;
}

export { type VideoGenerationResult as SeedanceVideoResult };

/**
 * Build the provider-specific webhook URL.
 */
function getWebhookUrl(provider: VideoProvider): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }
  return `${baseUrl}/api/video/webhook/${provider}`;
}

/**
 * Submit a video generation job via the active provider for the given model.
 *
 * @param modelId The display model ID (e.g., "kling-v2.6-pro")
 * @param params The input parameters for the model
 * @returns The request ID and provider info for tracking
 */
export async function submitVideoGeneration(
  modelId: string,
  params: Record<string, any>,
): Promise<SubmitVideoGenerationResult> {
  const variant = getActiveProvider(modelId);
  const client = getProviderClient(variant.provider);
  const mappedParams = applyParamMapping(params, variant.paramMapping);
  const webhookUrl = getWebhookUrl(variant.provider);

  const result = await client.submitGeneration(
    variant.providerModelId,
    mappedParams,
    webhookUrl
  );

  // KSyun stashes any freshly minted element IDs on the params object as a
  // side channel; lift them onto the typed result for the route to persist.
  const writeBacks =
    (mappedParams as any).__ksyunElementWriteBacks as
      | Array<{ libraryElementId: string; ksyunElementId: number }>
      | undefined;

  return {
    requestId: result.requestId,
    provider: variant.provider,
    providerModelId: result.providerModelId ?? variant.providerModelId,
    ksyunElementWriteBacks:
      writeBacks && writeBacks.length > 0 ? writeBacks : undefined,
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
