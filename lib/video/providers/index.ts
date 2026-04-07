import type { VideoProvider } from "../models";

export interface VideoGenerationResult {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
  seed: number;
}

export interface VideoProviderClient {
  submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string; providerModelId?: string }>;

  getStatus(
    providerModelId: string,
    requestId: string
  ): Promise<{ status: "in_queue" | "in_progress" | "completed" | "failed" }>;

  getResult(
    providerModelId: string,
    requestId: string
  ): Promise<{ data: any }>;

  tryRecover(
    providerModelId: string,
    requestId: string
  ): Promise<{
    status: "completed" | "in_progress" | "failed";
    result?: VideoGenerationResult;
    error?: string;
  }>;
}

import { FalVideoProvider } from "./fal";
import { KieVideoProvider } from "./kie";

const providers: Record<VideoProvider, VideoProviderClient> = {
  fal: new FalVideoProvider(),
  kie: new KieVideoProvider(),
};

export function getProviderClient(provider: VideoProvider): VideoProviderClient {
  const client = providers[provider];
  if (!client) {
    throw new Error(`Unknown video provider: ${provider}`);
  }
  return client;
}
