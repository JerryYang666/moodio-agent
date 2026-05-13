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

type KsyunElementTaskStatus = "submitted" | "processing" | "succeed" | "failed";

interface KsyunTaskData {
  task_id: string;
  task_status: KsyunElementTaskStatus;
  task_status_msg?: string;
  task_info?: { external_task_id?: string };
  task_result?: {
    videos?: Array<{ id?: string; url?: string; duration?: string }>;
    elements?: Array<{ element_id: number; status?: string }>;
  };
  created_at?: number;
  updated_at?: number;
}

/**
 * Shape returned by GET /{model}/v1/videos/omni-video/{task_id}.
 *
 * Two forms are observed in practice at any state (in-flight OR terminal):
 *
 * 1. Flat/camelCased form:
 *    { taskId, type, status: RUNNING|SUCCEED|FAILED|...,
 *      videoGenerateTaskInfo: { status, errMsg, unitPrice,
 *        videoGenerateTaskOutput: { mediaBasicInfos: [{ mediaUrl, mediaDuration }] } } }
 *    NOTE: `videoGenerateTaskOutput` is nested INSIDE `videoGenerateTaskInfo`.
 *
 * 2. Enveloped snake_case form:
 *    { code: 0, message, data: { task_id, task_status, task_info, task_result } }
 *
 * We accept both and normalize on parse.
 */
type KsyunVideoTaskStatus =
  | "PENDING"
  | "QUEUED"
  | "PROCESSING"
  | "RUNNING"
  | "SUCCEEDED"
  | "SUCCEED"
  | "FAILED";

interface KsyunMediaBasicInfo {
  url?: string;
  mediaUrl?: string;
  resourceUrl?: string;
  duration?: string | number;
  mediaDuration?: string | number;
}

interface KsyunVideoTaskOutput {
  mediaBasicInfos?: KsyunMediaBasicInfo[];
}

interface KsyunVideoTaskResponse {
  taskId: string;
  type?: string;
  status: KsyunVideoTaskStatus | string;
  createTime?: string;
  videoGenerateTaskInfo?: {
    status?: string;
    errMsg?: string;
    unitPrice?: number;
    // Real responses nest the output here.
    videoGenerateTaskOutput?: KsyunVideoTaskOutput;
  };
  // Kept for backward-compat / defensive parsing if ksyun ever returns it flat.
  videoGenerateTaskOutput?: KsyunVideoTaskOutput;
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
      refer_images: refs.slice(0, 3).map((image_url) => ({ image_url })),
    },
  };

  const url = `${KSYUN_API_BASE}/v1/general/advanced-custom-elements`;
  const bodyJson = JSON.stringify(body);
  console.log(
    `[ksyun CreateElement] POST ${url}\n` +
      `  headers: ${JSON.stringify({
        "Content-Type": "application/json",
        Authorization: "Bearer <redacted>",
      })}\n` +
      `  body: ${bodyJson}`
  );

  const res = await fetch(url, {
    method: "POST",
    headers: ksyunAuthHeaders(),
    body: bodyJson,
  });

  const rawText = await res.text();
  console.log(
    `[ksyun CreateElement] Response ${res.status}:`,
    rawText
  );

  if (!res.ok) {
    throw new Error(`ksyun createElement failed (${res.status}): ${rawText}`);
  }

  let json: KsyunTaskEnvelope<KsyunTaskData>;
  try {
    json = JSON.parse(rawText) as KsyunTaskEnvelope<KsyunTaskData>;
  } catch (e) {
    throw new Error(
      `ksyun createElement returned non-JSON: ${rawText.slice(0, 500)}`
    );
  }

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

/**
 * Map ksyun's uppercase video-task status to our internal enum. Status values
 * are uppercased via toUpperCase() first so we tolerate casing drift.
 */
function mapKsyunVideoStatus(
  status: string | undefined
): "in_queue" | "in_progress" | "completed" | "failed" {
  switch ((status ?? "").toUpperCase()) {
    case "PENDING":
    case "QUEUED":
      return "in_queue";
    case "PROCESSING":
    case "RUNNING":
      return "in_progress";
    case "SUCCEEDED":
    case "SUCCESS":
    case "SUCCEED":
      return "completed";
    case "FAILED":
    default:
      return "failed";
  }
}

function parseVideoResult(
  task: KsyunVideoTaskResponse
): VideoGenerationResult | null {
  const output =
    task.videoGenerateTaskInfo?.videoGenerateTaskOutput ??
    task.videoGenerateTaskOutput;
  const info = output?.mediaBasicInfos?.[0];
  const url = info?.mediaUrl ?? info?.url ?? info?.resourceUrl;
  if (!url) return null;
  return { video: { url }, seed: 0 };
}

function getTaskErrorMessage(task: KsyunVideoTaskResponse): string {
  return (
    task.videoGenerateTaskInfo?.errMsg ||
    `Generation ${task.status} on ksyun`
  );
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

    // KSyun's createElement is a 2-step async API (POST + poll, up to 120s).
    // We cache the returned element_id on the library element row keyed by a
    // fingerprint of the source images. Reuse paths land here as a pre-set
    // `ksyunElementId` on the kling_elements entry — emitted by the
    // video-generate route after it loads the library row.
    //
    // Shape of `el` at this point (set by the route):
    //   { name, description, element_input_urls, libraryElementId?,
    //     ksyunElementId? (cached), ksyunSourceFingerprint? }
    const elementNames: string[] = [];
    const elementIds: number[] = [];
    const writeBacks: Array<{
      libraryElementId: string;
      ksyunElementId: number;
    }> = [];
    for (const el of klingElements) {
      const urls: string[] = Array.isArray((el as any).element_input_urls)
        ? (el as any).element_input_urls
        : Array.isArray(el.element_input_ids)
          ? el.element_input_ids
          : [];
      if (urls.length === 0) continue;

      const cachedId = (el as any).ksyunElementId;
      let id: number;
      if (typeof cachedId === "number" && Number.isFinite(cachedId)) {
        console.log(
          `[ksyun CreateElement] Reusing cached element_id=${cachedId} for "${el.name}"`
        );
        id = cachedId;
      } else {
        id = await createElement({
          name: el.name,
          description: el.description,
          imageUrls: urls,
        });
        const libraryElementId = (el as any).libraryElementId;
        if (typeof libraryElementId === "string" && libraryElementId) {
          writeBacks.push({ libraryElementId, ksyunElementId: id });
        }
      }
      elementNames.push(el.name);
      elementIds.push(id);
    }
    // Make the freshly minted IDs available to the caller so it can persist
    // them back onto the library element rows.
    (params as any).__ksyunElementWriteBacks = writeBacks;

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

    const submitUrl = `${KSYUN_API_BASE}/${modelName}/v1/videos/omni-video`;
    const bodyJson = JSON.stringify(body);
    console.log(
      `[ksyun Submit] POST ${submitUrl}\n` +
        `  headers: ${JSON.stringify({
          "Content-Type": "application/json",
          Authorization: "Bearer <redacted>",
        })}\n` +
        `  body: ${bodyJson}`
    );

    const res = await fetch(submitUrl, {
      method: "POST",
      headers: ksyunAuthHeaders(),
      body: bodyJson,
    });

    const rawText = await res.text();
    console.log(`[ksyun Submit] Response ${res.status}:`, rawText);

    if (!res.ok) {
      throw new Error(`ksyun submit failed (${res.status}): ${rawText}`);
    }

    let json: any;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error(
        `ksyun submit returned non-JSON: ${rawText.slice(0, 500)}`
      );
    }

    // ksyun's omni-video submit returns a flat {taskId} body in practice,
    // even though the docs show the enveloped {code, data:{task_id}} form.
    // Accept both.
    const taskId: string | undefined =
      json?.data?.task_id ?? json?.task_id ?? json?.taskId;

    if (!taskId) {
      const code = json?.code;
      const msg = json?.message ?? json?.msg;
      throw new Error(
        `ksyun submit error (code ${code}): ${msg ?? "no task id in response"}`
      );
    }

    return { requestId: taskId };
  }

  async getStatus(
    providerModelId: string,
    requestId: string
  ): Promise<{ status: "in_queue" | "in_progress" | "completed" | "failed" }> {
    const task = await this.fetchTask(providerModelId, requestId);
    return { status: mapKsyunVideoStatus(task.status) };
  }

  async getResult(
    providerModelId: string,
    requestId: string
  ): Promise<{ data: any }> {
    const task = await this.fetchTask(providerModelId, requestId);
    if (mapKsyunVideoStatus(task.status) !== "completed") {
      throw new Error(
        `Task ${requestId} is not complete (status: ${task.status})`
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
      const mapped = mapKsyunVideoStatus(task.status);
      if (mapped === "in_queue" || mapped === "in_progress") {
        return { status: "in_progress" };
      }
      if (mapped === "failed") {
        return { status: "failed", error: getTaskErrorMessage(task) };
      }
      // completed
      const result = parseVideoResult(task);
      if (!result?.video?.url) {
        return { status: "failed", error: "No video URL in ksyun result" };
      }
      return { status: "completed", result };
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
  ): Promise<KsyunVideoTaskResponse> {
    const modelName = providerModelId || KSYUN_MODEL_NAME;
    const url = `${KSYUN_API_BASE}/${modelName}/v1/videos/omni-video/${encodeURIComponent(taskId)}`;
    console.log(`[ksyun QueryTask] GET ${url}`);
    const res = await fetch(url, { headers: ksyunAuthHeaders() });
    const rawText = await res.text();
    console.log(`[ksyun QueryTask] Response ${res.status}:`, rawText);

    if (!res.ok) {
      throw new Error(`ksyun queryTask failed (${res.status}): ${rawText}`);
    }

    let json: any;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error(
        `ksyun queryTask returned non-JSON: ${rawText.slice(0, 500)}`
      );
    }

    // Non-zero `code` responses (e.g. kling_task_not_exist) come back with
    // HTTP 200 / 400 inside an envelope, not the flat task shape.
    if (typeof json?.code === "number" && json.code !== 0) {
      throw new Error(
        `ksyun queryTask error (code ${json.code}): ${json.message ?? json.msg ?? "unknown"}`
      );
    }

    // Enveloped form: {code:0, message, data:{task_id, task_status, task_result?, ...}}.
    // Unwrap into our flat task shape, promoting task_result.videos[0].url into
    // videoGenerateTaskInfo.videoGenerateTaskOutput so parseVideoResult finds it.
    if (json?.data && (json.data.task_id || json.data.task_status)) {
      const videos = json.data.task_result?.videos;
      const firstVideoUrl: string | undefined = Array.isArray(videos)
        ? videos[0]?.url
        : undefined;
      return {
        taskId: json.data.task_id,
        status: json.data.task_status,
        videoGenerateTaskInfo: {
          status: json.data.task_status,
          errMsg: json.data.task_status_msg,
          videoGenerateTaskOutput: firstVideoUrl
            ? { mediaBasicInfos: [{ url: firstVideoUrl }] }
            : undefined,
        },
      } as KsyunVideoTaskResponse;
    }

    // Flat form with top-level `taskId` / `status`.
    if (!json?.taskId && !json?.status) {
      throw new Error(
        `ksyun queryTask returned unexpected shape: ${rawText.slice(0, 500)}`
      );
    }

    return json as KsyunVideoTaskResponse;
  }
}
