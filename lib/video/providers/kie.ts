import type { VideoProviderClient, VideoGenerationResult } from "./index";

const KIE_API_BASE = "https://api.kie.ai";
const KIE_FILE_UPLOAD_BASE = "https://kieai.redpandaai.co";

function getApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error("KIE_API_KEY environment variable is not set");
  return key;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Kie File Upload — re-upload external URLs so Kie can infer the file type
// ---------------------------------------------------------------------------

interface KieFileUploadResponse {
  success: boolean;
  code: number;
  msg: string;
  data: {
    fileName: string;
    filePath: string;
    downloadUrl: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: string;
  };
}

const IMAGE_URL_KEYS = new Set([
  "image_url",
  "image_urls",
  "imageUrls",
  "start_image_url",
  "end_image_url",
  "first_frame_url",
  "last_frame_url",
]);

function isImageUrlParam(key: string): boolean {
  return IMAGE_URL_KEYS.has(key);
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

/**
 * Try to determine a file extension for the given URL.
 * 1. Check the URL path for a recognisable extension.
 * 2. Fall back to a HEAD request to read Content-Type.
 * 3. Default to ".jpg" — Kie needs *some* extension.
 */
async function inferExtension(url: string): Promise<string> {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
    if (match) {
      const ext = `.${match[1].toLowerCase()}`;
      if (Object.values(MIME_TO_EXT).includes(ext)) return ext;
    }
  } catch {}

  try {
    const head = await fetch(url, { method: "HEAD" });
    const ct = head.headers.get("content-type")?.split(";")[0]?.trim();
    if (ct && MIME_TO_EXT[ct]) return MIME_TO_EXT[ct];
  } catch (err) {
    console.warn("[Kie Upload] HEAD request failed, defaulting to .jpg", err);
  }

  return ".jpg";
}

/**
 * Upload an external image URL to Kie's temp storage so the task API
 * receives a URL it can reliably resolve the file type from.
 * URLs already hosted on Kie's temp storage are passed through as-is.
 */
async function uploadToKie(url: string): Promise<string> {
  if (url.includes("redpandaai.co")) return url;

  const ext = await inferExtension(url);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

  console.log(
    `[Kie Upload] Re-uploading external image to Kie temp storage (fileName: ${fileName})`
  );

  const res = await fetch(`${KIE_FILE_UPLOAD_BASE}/api/file-url-upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      fileUrl: url,
      uploadPath: "moodio/video-inputs",
      fileName,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kie file upload failed (${res.status}): ${text}`);
  }

  const json: KieFileUploadResponse = await res.json();
  if (!json.success || json.code !== 200) {
    throw new Error(`Kie file upload error (${json.code}): ${json.msg}`);
  }

  console.log(
    `[Kie Upload] OK — ${json.data.mimeType}, ${json.data.fileSize} bytes → ${json.data.downloadUrl}`
  );
  return json.data.downloadUrl;
}

async function reuploadSingle(value: string): Promise<string> {
  return uploadToKie(value);
}

async function reuploadArray(value: string[]): Promise<string[]> {
  return Promise.all(value.map(uploadToKie));
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
  params: Record<string, any>
): Promise<Record<string, any>> {
  const prepared: Record<string, any> = {};
  const uploadTasks: Promise<void>[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (key.endsWith("_urls") && typeof value === "string") {
      prepared[key] = [value];
    } else {
      prepared[key] = value;
    }
  }

  for (const [key, value] of Object.entries(prepared)) {
    if (!isImageUrlParam(key)) continue;

    if (Array.isArray(value)) {
      uploadTasks.push(
        reuploadArray(value as string[]).then((urls) => {
          prepared[key] = urls;
        })
      );
    } else if (typeof value === "string" && value.startsWith("http")) {
      uploadTasks.push(
        reuploadSingle(value).then((url) => {
          prepared[key] = url;
        })
      );
    }
  }

  if (Array.isArray(prepared.kling_elements)) {
    for (const elem of prepared.kling_elements) {
      if (Array.isArray(elem.element_input_urls)) {
        uploadTasks.push(
          reuploadArray(elem.element_input_urls).then((urls) => {
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

    const input = await prepareInputParams(transformed);

    const requestBody = {
      model: providerModelId,
      callBackUrl: webhookUrl,
      input,
    };

    console.log("[Kie Submit] Request:", JSON.stringify(requestBody, null, 2));

    const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: authHeaders(),
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
      headers: authHeaders(),
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
    const res = await fetch(url, { headers: authHeaders() });

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
