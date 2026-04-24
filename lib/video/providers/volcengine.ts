import type { VideoProviderClient, VideoGenerationResult } from "./index";
import type { MediaReference } from "@/lib/video/models";

const ARK_API_BASE = "https://ark.cn-beijing.volces.com/api/v3";

const ARK_FETCH_TIMEOUT_MS = 30_000;
const ARK_SUBMIT_TIMEOUT_MS = 120_000;
const ARK_MAX_RETRIES = 3;
const ARK_RETRY_BASE_DELAY_MS = 2_000;

interface ArkFetchOpts {
  timeoutMs?: number;
  retryOnTimeout?: boolean;
}

/**
 * fetch wrapper for Volcengine Ark API with extended timeout and retry.
 * Mainland China endpoints can be flaky from overseas — retries with
 * exponential backoff absorb transient connect timeouts.
 */
async function arkFetch(
  url: string,
  init?: RequestInit,
  opts?: ArkFetchOpts
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? ARK_FETCH_TIMEOUT_MS;
  const retryOnTimeout = opts?.retryOnTimeout ?? true;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= ARK_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res;
    } catch (error: any) {
      lastError = error;
      const isTimeout = error?.name === "TimeoutError";
      const isRetryable =
        error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
        error?.cause?.code === "ECONNRESET" ||
        error?.cause?.code === "ETIMEDOUT" ||
        (isTimeout && retryOnTimeout);

      if (!isRetryable || attempt === ARK_MAX_RETRIES) break;

      const delay = ARK_RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `[Volcengine] Request to ${url} failed (${error?.cause?.code ?? error.message}), ` +
        `retrying in ${delay}ms (attempt ${attempt + 1}/${ARK_MAX_RETRIES})`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

function getArkApiKey(): string {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error("ARK_API_KEY environment variable is not set");
  return key;
}

function arkAuthHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getArkApiKey()}`,
  };
}

// ---------------------------------------------------------------------------
// Volcengine API response types
// ---------------------------------------------------------------------------

interface VolcengineCreateResponse {
  id: string;
}

interface VolcengineTaskResponse {
  id: string;
  status: "running" | "succeeded" | "failed" | "expired";
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

// ---------------------------------------------------------------------------
// Content array builder
// ---------------------------------------------------------------------------

type ContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role?: string }
  | { type: "video_url"; video_url: { url: string }; role?: string }
  | { type: "audio_url"; audio_url: { url: string }; role?: string };

/**
 * Build the Volcengine `content` array from our internal params.
 *
 * Three mutually exclusive modes:
 *  1. Reference mode — media_references present → reference_image / reference_video / reference_audio roles
 *  2. First/last frame mode — first_frame_url or image_url present → first_frame / last_frame roles
 *  3. Text-to-video — prompt only
 */
function buildContentArray(params: Record<string, any>): ContentItem[] {
  const items: ContentItem[] = [];

  const prompt: string | undefined = params.prompt;
  if (prompt) {
    items.push({ type: "text", text: prompt });
  }

  const mediaRefs: MediaReference[] | undefined = params.media_references;
  if (Array.isArray(mediaRefs) && mediaRefs.length > 0) {
    for (const ref of mediaRefs) {
      if (ref.type === "image") {
        items.push({
          type: "image_url",
          image_url: { url: ref.id },
          role: "reference_image",
        });
      } else if (ref.type === "video") {
        items.push({
          type: "video_url",
          video_url: { url: ref.id },
          role: "reference_video",
        });
      } else if (ref.type === "audio") {
        items.push({
          type: "audio_url",
          audio_url: { url: ref.id },
          role: "reference_audio",
        });
      }
    }
    return items;
  }

  const firstFrame: string | undefined =
    params.first_frame_url || params.image_url;
  if (firstFrame) {
    items.push({
      type: "image_url",
      image_url: { url: firstFrame },
      role: "first_frame",
    });
  }

  const lastFrame: string | undefined =
    params.last_frame_url || params.end_image_url;
  if (lastFrame) {
    items.push({
      type: "image_url",
      image_url: { url: lastFrame },
      role: "last_frame",
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

function mapVolcengineStatus(
  status: string
): "in_queue" | "in_progress" | "completed" | "failed" {
  switch (status) {
    case "running":
      return "in_progress";
    case "succeeded":
      return "completed";
    case "failed":
    case "expired":
      return "failed";
    default:
      return "failed";
  }
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class VolcengineVideoProvider implements VideoProviderClient {
  async submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string }> {
    const content = buildContentArray(params);

    const body: Record<string, any> = {
      model: providerModelId,
      content,
      watermark: false,
      callback_url: webhookUrl,
    };

    if (params.resolution) body.resolution = params.resolution;

    if (params.aspect_ratio) {
      body.ratio = params.aspect_ratio === "adaptive" ? "adaptive" : params.aspect_ratio;
    }

    if (params.duration !== undefined) {
      body.duration = typeof params.duration === "string"
        ? parseInt(params.duration, 10)
        : params.duration;
    }

    if (params.generate_audio !== undefined) {
      body.generate_audio = params.generate_audio;
    }

    if (params.seed !== undefined && params.seed !== -1) {
      body.seed = params.seed;
    }

    if (params.web_search === true) {
      body.tools = [{ type: "web_search" }];
    }

    console.log(
      "[Volcengine Submit] Request:",
      JSON.stringify(body, null, 2)
    );

    const res = await arkFetch(
      `${ARK_API_BASE}/contents/generations/tasks`,
      {
        method: "POST",
        headers: arkAuthHeaders(),
        body: JSON.stringify(body),
      },
      { timeoutMs: ARK_SUBMIT_TIMEOUT_MS, retryOnTimeout: false }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[Volcengine Submit] HTTP error:", res.status, text);
      throw new Error(`Volcengine createTask failed (${res.status}): ${text}`);
    }

    const json: VolcengineCreateResponse = await res.json();
    console.log("[Volcengine Submit] Response:", JSON.stringify(json, null, 2));

    if (!json.id) {
      throw new Error("Volcengine createTask returned no task id");
    }

    return { requestId: json.id };
  }

  async getStatus(
    _providerModelId: string,
    requestId: string
  ): Promise<{
    status: "in_queue" | "in_progress" | "completed" | "failed";
  }> {
    const task = await this.fetchTask(requestId);
    return { status: mapVolcengineStatus(task.status) };
  }

  async getResult(
    _providerModelId: string,
    requestId: string
  ): Promise<{ data: any }> {
    const task = await this.fetchTask(requestId);
    if (task.status !== "succeeded") {
      throw new Error(
        `Task ${requestId} is not complete (status: ${task.status})`
      );
    }
    return { data: this.parseResult(task) };
  }

  async tryRecover(
    _providerModelId: string,
    requestId: string
  ): Promise<{
    status: "completed" | "in_progress" | "failed";
    result?: VideoGenerationResult;
    error?: string;
  }> {
    try {
      const task = await this.fetchTask(requestId);

      if (task.status === "running") {
        return { status: "in_progress" };
      }

      if (task.status === "failed" || task.status === "expired") {
        return {
          status: "failed",
          error:
            task.error?.message ||
            `Generation ${task.status} on Volcengine`,
        };
      }

      if (task.status === "succeeded") {
        const result = this.parseResult(task);
        if (!result?.video?.url) {
          return { status: "failed", error: "No video URL in Volcengine result" };
        }
        return { status: "completed", result };
      }

      return { status: "failed", error: `Unknown Volcengine status: ${task.status}` };
    } catch (error: any) {
      console.error("[Volcengine Recovery] Error recovering generation:", error);
      return {
        status: "failed",
        error: error.message || "Failed to recover from Volcengine",
      };
    }
  }

  private async fetchTask(taskId: string): Promise<VolcengineTaskResponse> {
    const url = `${ARK_API_BASE}/contents/generations/tasks/${encodeURIComponent(taskId)}`;
    const res = await arkFetch(url, { headers: arkAuthHeaders() });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Volcengine getTask failed (${res.status}): ${text}`);
    }

    return (await res.json()) as VolcengineTaskResponse;
  }

  private parseResult(task: VolcengineTaskResponse): VideoGenerationResult | null {
    const videoUrl = task.content?.video_url;
    if (!videoUrl) return null;
    return {
      video: { url: videoUrl },
      seed: 0,
    };
  }
}
