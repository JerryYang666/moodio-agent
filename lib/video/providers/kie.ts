import type { VideoProviderClient, VideoGenerationResult } from "./index";

const KIE_API_BASE = "https://api.kie.ai";

function getApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error("KIE_API_KEY environment variable is not set");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

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
 * Kie expects image/file URL params as arrays (e.g. `image_urls: [...]`).
 * After paramMapping renames `image_url` → `image_urls`, the value is still
 * a plain string. This function wraps any string value whose key ends with
 * `_urls` into an array.
 */
function prepareInputParams(
  params: Record<string, any>
): Record<string, any> {
  const prepared: Record<string, any> = {};

  for (const [key, value] of Object.entries(params)) {
    if (key.endsWith("_urls") && typeof value === "string") {
      prepared[key] = [value];
    } else {
      prepared[key] = value;
    }
  }

  return prepared;
}

export class KieVideoProvider implements VideoProviderClient {
  async submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string }> {
    const input = prepareInputParams(params);

    const requestBody = {
      model: providerModelId,
      callBackUrl: webhookUrl,
      input,
    };

    console.log("[Kie Submit] Request:", JSON.stringify(requestBody, null, 2));

    const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: headers(),
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
    const res = await fetch(url, { headers: headers() });

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
