import type { VideoProviderClient, VideoGenerationResult } from "./index";
import {
  KIE_API_BASE,
  kieAuthHeaders,
  reuploadForKie,
  reuploadArrayForKie,
  uploadToKie,
  type KieFormatProfile,
} from "@/lib/kie/client";
import type { MediaReference } from "@/lib/video/models";

const IMAGE_URL_KEYS = new Set([
  "image_url",
  "image_urls",
  "imageUrls",
  "start_image_url",
  "end_image_url",
  "first_frame_url",
  "last_frame_url",
  "reference_image_urls",
]);

const VIDEO_URL_KEYS = new Set([
  "reference_video_urls",
]);

const AUDIO_URL_KEYS = new Set([
  "reference_audio_urls",
]);

function isImageUrlParam(key: string): boolean {
  return IMAGE_URL_KEYS.has(key);
}

function isVideoUrlParam(key: string): boolean {
  return VIDEO_URL_KEYS.has(key);
}

function isAudioUrlParam(key: string): boolean {
  return AUDIO_URL_KEYS.has(key);
}

async function reuploadSingle(value: string, formatProfile?: KieFormatProfile): Promise<string> {
  return reuploadForKie(value, "moodio/video-inputs", { formatProfile });
}

async function reuploadArray(value: string[], formatProfile?: KieFormatProfile): Promise<string[]> {
  return reuploadArrayForKie(value, "moodio/video-inputs", { formatProfile });
}

async function reuploadVideoArray(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map((u) => uploadToKie(u, "moodio/video-inputs")));
}

async function reuploadElementArray(urls: string[]): Promise<string[]> {
  return reuploadArrayForKie(urls, "moodio/video-inputs");
}

// ---------------------------------------------------------------------------
// Param preparation
// ---------------------------------------------------------------------------

interface KieCreateTaskResponse {
  code: number;
  msg: string;
  data: { taskId: string };
}

interface KieTaskDetailResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    model: string;
    state: "waiting" | "queuing" | "generating" | "success" | "fail";
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
  };
}

/**
 * Normalise input params for the Kie task API:
 *  1. Wrap bare string values whose key ends with `_urls` into arrays.
 *  2. Re-upload any external image URLs via Kie's File Upload API so
 *     the task endpoint can reliably determine the file type.
 *  3. Re-upload image URLs nested inside kling_elements[].element_input_urls.
 */
async function prepareInputParams(
  params: Record<string, any>,
  { formatProfile }: { formatProfile?: KieFormatProfile } = {}
): Promise<Record<string, any>> {
  const normalized: Record<string, any> = { ...params };
  if (Array.isArray(normalized.media_references)) {
    const refs = normalized.media_references as MediaReference[];
    normalized.reference_image_urls = refs
      .filter((r) => r.type === "image")
      .map((r) => r.id);
    normalized.reference_video_urls = refs
      .filter((r) => r.type === "video")
      .map((r) => r.id);
    normalized.reference_audio_urls = refs
      .filter((r) => r.type === "audio")
      .map((r) => r.id);
    delete normalized.media_references;
  }

  const prepared: Record<string, any> = {};
  const uploadTasks: Promise<void>[] = [];

  for (const [key, value] of Object.entries(normalized)) {
    if (key.endsWith("_urls") && typeof value === "string") {
      prepared[key] = [value];
    } else {
      prepared[key] = value;
    }
  }

  for (const [key, value] of Object.entries(prepared)) {
    if (isImageUrlParam(key)) {
      if (Array.isArray(value)) {
        uploadTasks.push(
          reuploadArray(value as string[], formatProfile).then((urls) => {
            prepared[key] = urls;
          })
        );
      } else if (typeof value === "string" && value.startsWith("http")) {
        uploadTasks.push(
          reuploadSingle(value, formatProfile).then((url) => {
            prepared[key] = url;
          })
        );
      }
    } else if (isVideoUrlParam(key)) {
      if (Array.isArray(value)) {
        uploadTasks.push(
          reuploadVideoArray(value as string[]).then((urls) => {
            prepared[key] = urls;
          })
        );
      } else if (typeof value === "string" && value.startsWith("http")) {
        uploadTasks.push(
          uploadToKie(value, "moodio/video-inputs").then((url) => {
            prepared[key] = url;
          })
        );
      }
    } else if (isAudioUrlParam(key)) {
      if (Array.isArray(value)) {
        uploadTasks.push(
          Promise.all(
            (value as string[])
              .filter((u) => typeof u === "string" && u.startsWith("http"))
              .map((u) => uploadToKie(u, "moodio/audio-inputs"))
          ).then((urls) => {
            prepared[key] = urls;
          })
        );
      } else if (typeof value === "string" && value.startsWith("http")) {
        uploadTasks.push(
          uploadToKie(value, "moodio/audio-inputs").then((url) => {
            prepared[key] = url;
          })
        );
      }
    }
  }

  if (Array.isArray(prepared.kling_elements)) {
    for (const elem of prepared.kling_elements) {
      if (Array.isArray(elem.element_input_urls)) {
        uploadTasks.push(
          reuploadElementArray(elem.element_input_urls).then((urls) => {
            elem.element_input_urls = urls;
          })
        );
      }
    }
  }

  await Promise.all(uploadTasks);
  return prepared;
}

// ---------------------------------------------------------------------------
// Model-specific param transforms (keep higher layers clean)
// ---------------------------------------------------------------------------

function applySoraTransforms(params: Record<string, any>): Record<string, any> {
  const out = { ...params };
  if (out.aspect_ratio === "16:9") out.aspect_ratio = "landscape";
  else if (out.aspect_ratio === "9:16") out.aspect_ratio = "portrait";
  delete out.resolution;
  delete out.duration;
  if (out.upload_method === undefined) out.upload_method = "s3";
  out.remove_watermark = true;
  return out;
}

function applyKlingTransforms(params: Record<string, any>): Record<string, any> {
  const out = { ...params };
  if ("generate_audio" in out) {
    out.sound = out.generate_audio;
    delete out.generate_audio;
  }
  if (typeof out.start_image_url === "string") {
    out.image_urls = [out.start_image_url];
    delete out.start_image_url;
  }
  if (out.mode === undefined) out.mode = "pro";
  if (out.multi_shots === undefined) out.multi_shots = false;
  return out;
}

function isVeoModel(providerModelId: string): boolean {
  return providerModelId === "veo3" || providerModelId.startsWith("veo3");
}

function isSoraModel(providerModelId: string): boolean {
  return providerModelId.startsWith("sora-2");
}

function isKlingModel(providerModelId: string): boolean {
  return providerModelId.startsWith("kling-");
}

function isSeedance2Model(providerModelId: string): boolean {
  return providerModelId === "bytedance/seedance-2" || providerModelId === "bytedance/seedance-2-fast";
}

export class KieVideoProvider implements VideoProviderClient {
  async submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string }> {
    let transformed = { ...params };

    if (isSoraModel(providerModelId)) {
      transformed = applySoraTransforms(transformed);
    } else if (isKlingModel(providerModelId)) {
      transformed = applyKlingTransforms(transformed);
    }

    if (isVeoModel(providerModelId)) {
      return this.submitVeoGeneration(providerModelId, transformed, webhookUrl);
    }

    const formatProfile: KieFormatProfile | undefined = isSeedance2Model(providerModelId) ? "seedance2" : undefined;
    const input = await prepareInputParams(transformed, { formatProfile });

    const requestBody = {
      model: providerModelId,
      callBackUrl: webhookUrl,
      input,
    };

    console.log("[Kie Submit] Request:", JSON.stringify(requestBody, null, 2));

    const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: kieAuthHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Kie Submit] HTTP error:", res.status, text);
      throw new Error(`Kie createTask failed (${res.status}): ${text}`);
    }

    const json: KieCreateTaskResponse = await res.json();
    console.log("[Kie Submit] Response:", JSON.stringify(json, null, 2));

    if (json.code !== 200) {
      throw new Error(`Kie createTask error (${json.code}): ${json.msg}`);
    }

    return { requestId: json.data.taskId };
  }

  /**
   * Veo 3.1 uses a different endpoint with a flat body (no `input` wrapper).
   * Auto-detects generationType based on presence of images and model variant.
   */
  private async submitVeoGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string }> {
    const { prompt, imageUrls, aspect_ratio, duration, generate_audio, ...rest } = params;

    let imageUrlsArray: string[] | undefined;
    if (imageUrls) {
      const raw = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
      imageUrlsArray = await reuploadArray(raw);
    }

    const hasImages = imageUrlsArray && imageUrlsArray.length > 0;
    const generationType = hasImages
      ? "FIRST_AND_LAST_FRAMES_2_VIDEO"
      : "TEXT_2_VIDEO";

    const requestBody: Record<string, any> = {
      model: providerModelId,
      callBackUrl: webhookUrl,
      prompt: prompt || "",
      generationType,
    };

    if (imageUrlsArray && imageUrlsArray.length > 0) {
      requestBody.imageUrls = imageUrlsArray;
    }
    if (aspect_ratio !== undefined) requestBody.aspect_ratio = aspect_ratio;
    if (duration !== undefined) requestBody.duration = duration;
    if (generate_audio !== undefined) requestBody.generate_audio = generate_audio;

    console.log("[Kie Veo Submit] Request:", JSON.stringify(requestBody, null, 2));

    const res = await fetch(`${KIE_API_BASE}/api/v1/veo/generate`, {
      method: "POST",
      headers: kieAuthHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Kie Veo Submit] HTTP error:", res.status, text);
      throw new Error(`Kie Veo generate failed (${res.status}): ${text}`);
    }

    const json: KieCreateTaskResponse = await res.json();
    console.log("[Kie Veo Submit] Response:", JSON.stringify(json, null, 2));

    if (json.code !== 200) {
      throw new Error(`Kie Veo generate error (${json.code}): ${json.msg}`);
    }

    return { requestId: json.data.taskId };
  }

  async getStatus(
    _providerModelId: string,
    requestId: string
  ): Promise<{
    status: "in_queue" | "in_progress" | "completed" | "failed";
  }> {
    const detail = await this.fetchTaskDetail(requestId);
    return { status: mapKieState(detail.data.state) };
  }

  async getResult(
    _providerModelId: string,
    requestId: string
  ): Promise<{ data: any }> {
    const detail = await this.fetchTaskDetail(requestId);
    if (detail.data.state !== "success") {
      throw new Error(
        `Task ${requestId} is not complete (state: ${detail.data.state})`
      );
    }
    return { data: parseResultJson(detail.data.resultJson) };
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
      const detail = await this.fetchTaskDetail(requestId);
      const state = detail.data.state;

      if (state === "waiting" || state === "queuing" || state === "generating") {
        return { status: "in_progress" };
      }

      if (state === "fail") {
        return {
          status: "failed",
          error: detail.data.failMsg || "Generation failed on Kie",
        };
      }

      if (state === "success") {
        const parsed = parseResultJson(detail.data.resultJson);
        if (!parsed?.video?.url) {
          return { status: "failed", error: "No video URL in Kie result" };
        }
        return { status: "completed", result: parsed };
      }

      return { status: "failed", error: `Unknown Kie state: ${state}` };
    } catch (error: any) {
      console.error("[Kie Recovery] Error recovering generation:", error);
      return {
        status: "failed",
        error: error.message || "Failed to recover from Kie",
      };
    }
  }

  private async fetchTaskDetail(
    taskId: string
  ): Promise<KieTaskDetailResponse> {
    const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
    const res = await fetch(url, { headers: kieAuthHeaders() });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kie recordInfo failed (${res.status}): ${text}`);
    }

    const json: KieTaskDetailResponse = await res.json();
    if (json.code !== 200) {
      throw new Error(`Kie recordInfo error (${json.code}): ${json.msg}`);
    }

    return json;
  }
}

function mapKieState(
  state: string
): "in_queue" | "in_progress" | "completed" | "failed" {
  switch (state) {
    case "waiting":
    case "queuing":
      return "in_queue";
    case "generating":
      return "in_progress";
    case "success":
      return "completed";
    case "fail":
      return "failed";
    default:
      return "failed";
  }
}

/**
 * Parse Kie's resultJson string into a VideoGenerationResult.
 * Kie returns `{ resultUrls: ["https://..."] }` — we take the first URL.
 */
function parseResultJson(
  resultJson: string | undefined
): VideoGenerationResult | null {
  if (!resultJson) return null;
  try {
    const parsed = JSON.parse(resultJson);
    const urls: string[] = parsed.resultUrls ?? [];
    if (urls.length === 0) return null;
    return {
      video: { url: urls[0] },
      seed: 0,
    };
  } catch {
    return null;
  }
}
