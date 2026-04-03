import { getSignedImageUrl, validateDownloadUrl } from "@/lib/storage/s3";
import {
  KIE_API_BASE,
  getKieApiKey,
  kieAuthHeaders,
  reuploadArrayForKie,
} from "@/lib/kie/client";
import {
  ImageEditInput,
  ImageGenerationInput,
  ImageProviderResult,
  ImageSize,
} from "../types";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 180_000;

function resolveResolution(size?: ImageSize): "1K" | "2K" | "4K" {
  switch (size) {
    case "1k":
      return "1K";
    case "4k":
      return "4K";
    default:
      return "2K";
  }
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
    state: string;
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
  };
}

async function createTask(
  modelId: string,
  input: Record<string, any>
): Promise<string> {
  const body = { model: modelId, input };

  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: kieAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KIE createTask failed (${res.status}): ${text}`);
  }

  const json: KieCreateTaskResponse = await res.json();
  if (json.code !== 200) {
    throw new Error(`KIE createTask error (${json.code}): ${json.msg}`);
  }

  return json.data.taskId;
}

interface PollResult {
  resultUrls: string[];
  durationMs: number;
}

async function pollUntilDone(taskId: string): Promise<PollResult> {
  const start = Date.now();
  const interval = POLL_INTERVAL_MS;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, interval));

    const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${getKieApiKey()}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KIE recordInfo failed (${res.status}): ${text}`);
    }

    const json: KieTaskDetailResponse = await res.json();
    if (json.code !== 200) {
      throw new Error(`KIE recordInfo error (${json.code}): ${json.msg}`);
    }

    const { state, resultJson, failMsg, failCode } = json.data;

    if (state === "success") {
      if (!resultJson) {
        throw new Error("KIE task succeeded but resultJson is empty");
      }
      const parsed = JSON.parse(resultJson);
      const urls: string[] = parsed.resultUrls ?? [];
      if (urls.length === 0) {
        throw new Error("KIE task succeeded but no resultUrls found");
      }
      return { resultUrls: urls, durationMs: Date.now() - start };
    }

    if (state === "fail") {
      throw new Error(
        `KIE image generation failed: ${failMsg || failCode || "Unknown error"}`
      );
    }
  }

  throw new Error(
    `KIE image generation timed out after ${POLL_TIMEOUT_MS / 1000}s`
  );
}

async function downloadImage(
  url: string
): Promise<{ buffer: Buffer; contentType: string }> {
  validateDownloadUrl(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download KIE image: ${response.status} ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "image/png",
  };
}

export async function generateWithKie(
  modelId: string,
  input: ImageGenerationInput
): Promise<ImageProviderResult> {
  const taskId = await createTask(modelId, {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio || "auto",
    resolution: resolveResolution(input.imageSize),
    output_format: "png",
  });

  console.log(`[KIE Image] Task created: ${taskId}, polling for result...`);

  const { resultUrls, durationMs } = await pollUntilDone(taskId);
  const downloaded = await downloadImage(resultUrls[0]);

  console.log(`[KIE Image] Task ${taskId} completed in ${durationMs}ms, image downloaded`);

  return {
    imageBuffer: downloaded.buffer,
    contentType: downloaded.contentType,
    provider: "kie",
    providerModelId: modelId,
    response: { taskId, resultUrls, durationMs },
  };
}

export async function editWithKie(
  modelId: string,
  input: ImageEditInput
): Promise<ImageProviderResult> {
  const imageIds = input.imageIds || [];
  if (imageIds.length === 0) {
    throw new Error("KIE edit requires imageIds");
  }

  const signedUrls = imageIds.map((id) => getSignedImageUrl(id));
  const imageInput = await reuploadArrayForKie(signedUrls, "moodio/image-inputs", { allowWebp: true });

  const taskId = await createTask(modelId, {
    prompt: input.prompt,
    image_input: imageInput,
    aspect_ratio: input.aspectRatio || "auto",
    resolution: resolveResolution(input.imageSize),
    output_format: "png",
  });

  console.log(
    `[KIE Image] Edit task created: ${taskId}, polling for result...`
  );

  const { resultUrls, durationMs } = await pollUntilDone(taskId);
  const downloaded = await downloadImage(resultUrls[0]);

  console.log(`[KIE Image] Edit task ${taskId} completed in ${durationMs}ms, image downloaded`);

  return {
    imageBuffer: downloaded.buffer,
    contentType: downloaded.contentType,
    provider: "kie",
    providerModelId: modelId,
    response: { taskId, resultUrls, durationMs },
  };
}
