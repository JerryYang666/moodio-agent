import type { VideoProviderClient, VideoGenerationResult } from "./index";
import type { KlingElement, MediaReference } from "@/lib/video/models";

const KSYUN_API_BASE = "https://kspmas.ksyun.com";
const KSYUN_MODEL_NAME = "kling-v3-omni";

const ELEMENT_POLL_INTERVAL_MS = 2_000;
const ELEMENT_POLL_TIMEOUT_MS = 120_000;

function getKsyunApiKey(): string {
  const key = process.env.KSYUN_API_KEY;
  if (!key) throw new Error("KSYUN_API_KEY environment variable is not set");
  return key;
}

function ksyunAuthHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getKsyunApiKey()}`,
  };
}

// ---------------------------------------------------------------------------
// ksyun response types
// ---------------------------------------------------------------------------

interface KsyunTaskEnvelope<T = unknown> {
  code: number;
  message: string;
  request_id?: string;
  data?: T;
}

type KsyunTaskStatus = "submitted" | "processing" | "succeed" | "failed";

interface KsyunTaskData {
  task_id: string;
  task_status: KsyunTaskStatus;
  task_status_msg?: string;
  task_info?: { external_task_id?: string };
  task_result?: {
    videos?: Array<{ id?: string; url?: string; duration?: string }>;
    elements?: Array<{ element_id: number; status?: string }>;
  };
  created_at?: number;
  updated_at?: number;
}

// ---------------------------------------------------------------------------
// Prompt rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrite @-refs in our internal prompt syntax into ksyun's <<<…>>> syntax.
 *
 * - @elementName / @element_name → <<<element_N>>> where N is the element's
 *   1-indexed position in `elementNames`.
 * - @image1..@image4 (case-insensitive) → <<<image_N>>>.
 *
 * ksyun's `<<<image_N>>>` references are positional indices into `image_list`,
 * so we always place reference images BEFORE any first_frame/end_frame entries
 * to keep the numbering aligned with what the user typed.
 */
function rewritePrompt(
  prompt: string | undefined,
  elementNames: string[]
): string {
  if (!prompt) return "";
  let out = prompt;

  // @image1..@image9 (1-indexed, case-insensitive). Require a non-word char or
  // end-of-string after the number so @image10 doesn't become <<<image_1>>>0.
  out = out.replace(/@image(\d+)(?=\W|$)/gi, (_m, n: string) => `<<<image_${n}>>>`);

  // @elementName → <<<element_N>>>. Sort longer names first so "@Hero2" matches
  // before "@Hero" when both exist.
  const sorted = [...elementNames]
    .map((name, index) => ({ name, index }))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { name, index } of sorted) {
    if (!name) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${esc}(?=\\W|$)`, "g");
    out = out.replace(re, `<<<element_${index + 1}>>>`);
  }

  return out;
}

// ---------------------------------------------------------------------------
// image_list / video_list builders
// ---------------------------------------------------------------------------

interface KsyunImageListEntry {
  image_url: string;
  type?: "first_frame" | "end_frame";
}

interface KsyunVideoListEntry {
  video_url: string;
  refer_type: "feature" | "base";
  keep_original_sound?: "yes" | "no";
}

/**
 * Build ksyun's image_list. References come first (positional @image1..@image4
 * in the prompt index into this array), then first_frame, then end_frame.
 */
function buildImageList(params: Record<string, any>): KsyunImageListEntry[] {
  const out: KsyunImageListEntry[] = [];

  const refs: MediaReference[] = Array.isArray(params.media_references)
    ? params.media_references
    : [];
  for (const ref of refs) {
    if (ref.type === "image" && typeof ref.id === "string" && ref.id) {
      out.push({ image_url: ref.id });
    }
  }

  if (typeof params.start_image_url === "string" && params.start_image_url) {
    out.push({ image_url: params.start_image_url, type: "first_frame" });
  }
  if (typeof params.end_image_url === "string" && params.end_image_url) {
    out.push({ image_url: params.end_image_url, type: "end_frame" });
  }

  return out;
}

function buildVideoList(params: Record<string, any>): KsyunVideoListEntry[] {
  const refs: MediaReference[] = Array.isArray(params.media_references)
    ? params.media_references
    : [];
  const out: KsyunVideoListEntry[] = [];
  for (const ref of refs) {
    if (ref.type === "video" && typeof ref.id === "string" && ref.id) {
      out.push({ video_url: ref.id, refer_type: "feature" });
    }
  }
  // ksyun caps video_list at 1 entry.
  return out.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Element creation (image_refer only — we don't expose video-defined elements)
// ---------------------------------------------------------------------------

interface CreateElementInput {
  name: string;
  description: string;
  imageUrls: string[];
}

async function createElement(input: CreateElementInput): Promise<number> {
  const [frontal, ...refs] = input.imageUrls;
  if (!frontal || refs.length < 1) {
    throw new Error(
      `Element "${input.name}" needs at least 2 images (1 frontal + 1 refer); got ${input.imageUrls.length}`
    );
  }

  const body = {
    element_name: (input.name || "Element").slice(0, 20),
    element_description: (input.description || input.name || "").slice(0, 100),
    reference_type: "image_refer",
    element_image_list: {
      frontal_image: frontal,
      refer_images: refs.slice(0, 3),
    },
  };

  const res = await fetch(
    `${KSYUN_API_BASE}/v1/general/advanced-custom-elements`,
    {
      method: "POST",
      headers: ksyunAuthHeaders(),
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ksyun createElement failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as KsyunTaskEnvelope<KsyunTaskData>;
  if (json.code !== 0 || !json.data?.task_id) {
    throw new Error(
      `ksyun createElement error (code ${json.code}): ${json.message}`
    );
  }

  return pollElementUntilReady(json.data.task_id);
}

async function pollElementUntilReady(taskId: string): Promise<number> {
  const deadline = Date.now() + ELEMENT_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const url = `${KSYUN_API_BASE}/v1/general/advanced-custom-elements/${encodeURIComponent(taskId)}`;
    const res = await fetch(url, { headers: ksyunAuthHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `ksyun queryElement failed (${res.status}): ${text}`
      );
    }
    const json = (await res.json()) as KsyunTaskEnvelope<KsyunTaskData>;
    if (json.code !== 0) {
      throw new Error(
        `ksyun queryElement error (code ${json.code}): ${json.message}`
      );
    }
    const data = json.data;
    if (data?.task_status === "succeed") {
      const id = data.task_result?.elements?.[0]?.element_id;
      if (!id) {
        throw new Error(
          `ksyun element task ${taskId} succeeded but returned no element_id`
        );
      }
      return id;
    }
    if (data?.task_status === "failed") {
      throw new Error(
        `ksyun element task ${taskId} failed: ${data.task_status_msg || "unknown"}`
      );
    }
    await new Promise((r) => setTimeout(r, ELEMENT_POLL_INTERVAL_MS));
  }
  throw new Error(`ksyun element task ${taskId} timed out after ${ELEMENT_POLL_TIMEOUT_MS}ms`);
}

// ---------------------------------------------------------------------------
// Task-status mapping
// ---------------------------------------------------------------------------

function mapKsyunStatus(
  status: KsyunTaskStatus | undefined
): "in_queue" | "in_progress" | "completed" | "failed" {
  switch (status) {
    case "submitted":
      return "in_queue";
    case "processing":
      return "in_progress";
    case "succeed":
      return "completed";
    case "failed":
    default:
      return "failed";
  }
}

function parseVideoResult(data: KsyunTaskData): VideoGenerationResult | null {
  const url = data.task_result?.videos?.[0]?.url;
  if (!url) return null;
  return { video: { url }, seed: 0 };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class KsyunVideoProvider implements VideoProviderClient {
  async submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string }> {
    const modelName = providerModelId || KSYUN_MODEL_NAME;

    // Create elements sequentially to keep failures easy to attribute.
    // Each element takes a few seconds; a video job usually has ≤3 elements.
    const klingElements: KlingElement[] = Array.isArray(params.kling_elements)
      ? params.kling_elements
      : [];

    const elementNames: string[] = [];
    const elementIds: number[] = [];
    for (const el of klingElements) {
      // The generate route resolves element_input_ids → element_input_urls
      // before we get here, so we read URLs.
      const urls: string[] = Array.isArray((el as any).element_input_urls)
        ? (el as any).element_input_urls
        : Array.isArray(el.element_input_ids)
          ? el.element_input_ids
          : [];
      if (urls.length === 0) continue;
      const id = await createElement({
        name: el.name,
        description: el.description,
        imageUrls: urls,
      });
      elementNames.push(el.name);
      elementIds.push(id);
    }

    const body: Record<string, any> = {
      model_name: modelName,
      prompt: rewritePrompt(params.prompt, elementNames),
      callback_url: webhookUrl,
    };

    if (params.mode === "std" || params.mode === "pro") {
      body.mode = params.mode;
    }
    if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
    if (params.duration !== undefined) {
      body.duration =
        typeof params.duration === "number"
          ? String(params.duration)
          : params.duration;
    }

    if (typeof params.generate_audio === "boolean") {
      body.sound = params.generate_audio ? "on" : "off";
    }

    const imageList = buildImageList(params);
    if (imageList.length > 0) body.image_list = imageList;

    const videoList = buildVideoList(params);
    if (videoList.length > 0) body.video_list = videoList;

    if (elementIds.length > 0) {
      body.element_list = elementIds.map((element_id) => ({ element_id }));
    }

    console.log(
      "[ksyun Submit] Request:",
      JSON.stringify(body, null, 2)
    );

    const res = await fetch(
      `${KSYUN_API_BASE}/${modelName}/v1/videos/omni-video`,
      {
        method: "POST",
        headers: ksyunAuthHeaders(),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[ksyun Submit] HTTP error:", res.status, text);
      throw new Error(`ksyun submit failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as KsyunTaskEnvelope<KsyunTaskData>;
    console.log("[ksyun Submit] Response:", JSON.stringify(json, null, 2));

    if (json.code !== 0 || !json.data?.task_id) {
      throw new Error(`ksyun submit error (code ${json.code}): ${json.message}`);
    }

    return { requestId: json.data.task_id };
  }

  async getStatus(
    providerModelId: string,
    requestId: string
  ): Promise<{ status: "in_queue" | "in_progress" | "completed" | "failed" }> {
    const task = await this.fetchTask(providerModelId, requestId);
    return { status: mapKsyunStatus(task.task_status) };
  }

  async getResult(
    providerModelId: string,
    requestId: string
  ): Promise<{ data: any }> {
    const task = await this.fetchTask(providerModelId, requestId);
    if (task.task_status !== "succeed") {
      throw new Error(
        `Task ${requestId} is not complete (status: ${task.task_status})`
      );
    }
    return { data: parseVideoResult(task) };
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
      const task = await this.fetchTask(providerModelId, requestId);
      const status = task.task_status;
      if (status === "submitted" || status === "processing") {
        return { status: "in_progress" };
      }
      if (status === "failed") {
        return {
          status: "failed",
          error: task.task_status_msg || "Generation failed on ksyun",
        };
      }
      if (status === "succeed") {
        const result = parseVideoResult(task);
        if (!result?.video?.url) {
          return { status: "failed", error: "No video URL in ksyun result" };
        }
        return { status: "completed", result };
      }
      return { status: "failed", error: `Unknown ksyun status: ${status}` };
    } catch (error: any) {
      console.error("[ksyun Recovery] Error recovering generation:", error);
      return {
        status: "failed",
        error: error.message || "Failed to recover from ksyun",
      };
    }
  }

  private async fetchTask(
    providerModelId: string,
    taskId: string
  ): Promise<KsyunTaskData> {
    const modelName = providerModelId || KSYUN_MODEL_NAME;
    const url =
      `${KSYUN_API_BASE}/${modelName}/v1/videos/text2video/${encodeURIComponent(taskId)}` +
      `?kling_model=${encodeURIComponent(modelName)}`;
    const res = await fetch(url, { headers: ksyunAuthHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ksyun queryTask failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as KsyunTaskEnvelope<KsyunTaskData>;
    if (json.code !== 0 || !json.data) {
      throw new Error(`ksyun queryTask error (code ${json.code}): ${json.message}`);
    }
    return json.data;
  }
}
