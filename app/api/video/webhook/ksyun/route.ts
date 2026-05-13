import { NextRequest, NextResponse } from "next/server";
import type { VideoGenerationResult } from "@/lib/video/providers";
import {
  findGenerationByRequestId,
  isTerminal,
  handleGenerationFailure,
  processVideoResult,
} from "@/lib/video/webhook-handler";
import { waitUntil } from "@vercel/functions";

/**
 * ksyun callback payload. Two shapes have been observed:
 *
 * 1. The documented enveloped form (used by element tasks, possibly by video
 *    tasks too):
 *    { task_id, task_status: submitted|processing|succeed|failed,
 *      task_status_msg, task_result: { videos: [{ url }] } }
 *
 * 2. The same flat/camelCased shape the video query endpoint returns:
 *    { taskId, status: PENDING|PROCESSING|SUCCEEDED|FAILED,
 *      videoGenerateTaskInfo: { errMsg }, videoGenerateTaskOutput: { mediaBasicInfos: [{ url }] } }
 *
 * We don't know which form ksyun will actually POST here, so we accept both.
 * The raw request body is always logged so we can confirm which arrived.
 */
interface KsyunMediaBasicInfo {
  url?: string;
  mediaUrl?: string;
  resourceUrl?: string;
}

interface KsyunTaskOutput {
  mediaBasicInfos?: KsyunMediaBasicInfo[];
}

interface KsyunCallbackPayload {
  task_id?: string;
  taskId?: string;
  task_status?: string;
  status?: string;
  task_status_msg?: string;
  task_result?: {
    videos?: Array<{ id?: string; url?: string; duration?: string }>;
  };
  videoGenerateTaskInfo?: {
    status?: string;
    errMsg?: string;
    videoGenerateTaskOutput?: KsyunTaskOutput;
  };
  // Defensive: ksyun may also place the output at the top level.
  videoGenerateTaskOutput?: KsyunTaskOutput;
}

type NormalizedStatus = "in_queue" | "in_progress" | "completed" | "failed";

function normalizeStatus(raw: string | undefined): NormalizedStatus | null {
  switch ((raw ?? "").toUpperCase()) {
    case "SUBMITTED":
    case "PENDING":
    case "QUEUED":
      return "in_queue";
    case "PROCESSING":
    case "RUNNING":
      return "in_progress";
    case "SUCCEED":
    case "SUCCEEDED":
    case "SUCCESS":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return null;
  }
}

function extractVideoUrl(payload: KsyunCallbackPayload): string | undefined {
  const fromEnvelope = payload.task_result?.videos?.[0]?.url;
  if (fromEnvelope) return fromEnvelope;
  const output =
    payload.videoGenerateTaskInfo?.videoGenerateTaskOutput ??
    payload.videoGenerateTaskOutput;
  const info = output?.mediaBasicInfos?.[0];
  return info?.mediaUrl ?? info?.url ?? info?.resourceUrl;
}

function extractErrorMessage(payload: KsyunCallbackPayload): string {
  return (
    payload.task_status_msg ||
    payload.videoGenerateTaskInfo?.errMsg ||
    "Generation failed on ksyun"
  );
}

/**
 * POST /api/video/webhook/ksyun
 * Receives completion callbacks from ksyun. No signature verification.
 * Returns {code:0, msg:"ok"} per ksyun's expected format.
 */
export async function POST(request: NextRequest) {
  const rawText = await request.text();
  console.log(
    `[Webhook/ksyun] Received POST\n` +
      `  headers: ${JSON.stringify(Object.fromEntries(request.headers.entries()))}\n` +
      `  body: ${rawText}`
  );

  let payload: KsyunCallbackPayload;
  try {
    payload = JSON.parse(rawText);
  } catch (e) {
    console.error("[Webhook/ksyun] Failed to parse payload:", e);
    return NextResponse.json({ code: 1, msg: "Invalid payload" }, { status: 400 });
  }

  const taskId = payload.task_id ?? payload.taskId;
  if (!taskId) {
    console.error("[Webhook/ksyun] Missing task_id / taskId in payload");
    return NextResponse.json({ code: 1, msg: "Missing task_id" }, { status: 400 });
  }

  let generation = await findGenerationByRequestId(taskId);
  if (!generation) {
    // ksyun can fire the webhook before our submit request returns and
    // the DB row is committed. Wait briefly and retry once.
    console.warn(
      `[Webhook/ksyun] Generation not found for task ${taskId}, retrying in 6s…`
    );
    await new Promise((r) => setTimeout(r, 6000));
    generation = await findGenerationByRequestId(taskId);
  }
  if (!generation) {
    console.error(
      `[Webhook/ksyun] Generation still not found for task ${taskId} after retry`
    );
    // Return 200 so ksyun doesn't retry forever on a row we'll never have.
    return NextResponse.json({ code: 0, msg: "ok" });
  }

  if (isTerminal(generation)) {
    console.log(
      `[Webhook/ksyun] Generation ${generation.id} already ${generation.status}, skipping`
    );
    return NextResponse.json({ code: 0, msg: "ok" });
  }

  const rawStatus = payload.task_status ?? payload.status;
  const status = normalizeStatus(rawStatus);

  if (status === null) {
    console.warn(
      `[Webhook/ksyun] Unknown status "${rawStatus}" for task ${taskId}`
    );
    return NextResponse.json({ code: 0, msg: "ok" });
  }

  if (status === "in_queue" || status === "in_progress") {
    console.log(
      `[Webhook/ksyun] Task ${taskId} still ${rawStatus}, ignoring intermediate callback`
    );
    return NextResponse.json({ code: 0, msg: "ok" });
  }

  if (status === "failed") {
    const errorMsg = extractErrorMessage(payload);
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      errorMsg
    );
    console.error(
      `[Webhook/ksyun] Generation ${generation.id} failed:`,
      errorMsg
    );
    return NextResponse.json({ code: 0, msg: "ok" });
  }

  // completed
  const url = extractVideoUrl(payload);
  if (!url) {
    const msg = "ksyun callback succeeded but no video URL in payload";
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      msg
    );
    console.error(`[Webhook/ksyun] ${msg}`);
    return NextResponse.json({ code: 0, msg: "ok" });
  }

  const result: VideoGenerationResult = {
    video: { url },
    seed: 0,
  };

  waitUntil(processVideoResult(generation.id, result));
  return NextResponse.json({ code: 0, msg: "ok" });
}
