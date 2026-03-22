import { NextRequest, NextResponse } from "next/server";
import {
  verifyKieWebhook,
  extractKieWebhookHeaders,
  shouldSkipVerification,
} from "@/lib/video/webhook-verify";
import {
  findGenerationByRequestId,
  isTerminal,
  handleGenerationFailure,
  processVideoResult,
} from "@/lib/video/webhook-handler";
import { waitUntil } from "@vercel/functions";

/**
 * Kie webhook payload structure.
 * Ref: https://docs.kie.ai/common-api/webhook-verification
 *
 * On success the body looks like:
 * {
 *   "code": 200,
 *   "msg": "Playground task completed successfully.",
 *   "data": {
 *     "taskId": "...",
 *     "state": "success",
 *     "model": "...",
 *     "resultJson": "{\"resultUrls\":[\"https://...\"]}"
 *   }
 * }
 *
 * On failure:
 * {
 *   "code": 501,
 *   "msg": "Generation Failed",
 *   "data": {
 *     "taskId": "...",
 *     "state": "fail",
 *     "failCode": "...",
 *     "failMsg": "..."
 *   }
 * }
 */
interface KieWebhookPayload {
  taskId?: string;
  code: number;
  msg: string;
  data: {
    taskId?: string;
    task_id?: string;
    callbackType?: string;
    state?: string;
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
    info?: {
      resultUrls?: string[];
      result_urls?: string[];
      seeds?: number[];
      has_audio_list?: boolean[];
      media_ids?: string[];
      resolution?: string;
    };
    promptJson?: string;
    fallbackFlag?: boolean;
  };
}

/**
 * POST /api/video/webhook/kie
 * Receives completion callbacks from Kie.
 * Verifies HMAC-SHA256 signature against KIE_WEBHOOK_HMAC_KEY.
 */
export async function POST(request: NextRequest) {
  const bodyBuffer = Buffer.from(await request.arrayBuffer());

  console.log("[Webhook/Kie] Received payload:", bodyBuffer.toString("utf-8"));

  let payload: KieWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf-8"));
  } catch (e) {
    console.error("[Webhook/Kie] Failed to parse payload:", e);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const taskId = payload.data?.taskId || payload.data?.task_id || payload.taskId;
  if (!taskId) {
    console.error("[Webhook/Kie] Missing taskId in payload");
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  if (!shouldSkipVerification()) {
    const kieHeaders = extractKieWebhookHeaders(request.headers);
    const isValid = verifyKieWebhook(kieHeaders, taskId);
    if (!isValid) {
      console.error("[Webhook/Kie] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[Webhook/Kie] Skipping signature verification in development");
  }

  console.log(
    `[Webhook/Kie] Received callback for task ${taskId}, code: ${payload.code}, state: ${payload.data.state}`
  );

  // Kie uses taskId as the request ID we stored at submission time
  const generation = await findGenerationByRequestId(taskId);
  if (!generation) {
    console.error(`[Webhook/Kie] Generation not found for task ${taskId}`);
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 }
    );
  }

  if (isTerminal(generation)) {
    console.log(
      `[Webhook/Kie] Generation ${generation.id} already ${generation.status}, skipping`
    );
    return NextResponse.json({ received: true, status: "already_processed" });
  }

  const state = payload.data.state;

  if (state === "fail" || payload.code === 501) {
    const errorMsg =
      payload.data.failMsg || payload.msg || "Unknown error from Kie";
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      errorMsg
    );
    console.error(
      `[Webhook/Kie] Generation ${generation.id} failed:`,
      errorMsg
    );
    return NextResponse.json({ received: true, status: "failed" });
  }

  // Some models (e.g. veo3 via generationType payloads) return code 200 with
  // no state field, and put result URLs in data.info instead of resultJson.
  const isInfoSuccess =
    !state && payload.code === 200 && payload.data.info?.resultUrls?.length;

  if (state !== "success" && !isInfoSuccess) {
    console.log(
      `[Webhook/Kie] Non-terminal state "${state}" for generation ${generation.id}, ignoring`
    );
    return NextResponse.json({ received: true, status: "ignored" });
  }

  let resultUrls: string[] = [];

  if (isInfoSuccess) {
    resultUrls =
      payload.data.info!.resultUrls ?? payload.data.info!.result_urls ?? [];
  } else {
    try {
      if (payload.data.resultJson) {
        const parsed = JSON.parse(payload.data.resultJson);
        resultUrls = parsed.resultUrls ?? [];
      }
    } catch (e) {
      console.error("[Webhook/Kie] Failed to parse resultJson:", e);
    }
  }

  if (resultUrls.length === 0) {
    const errorMsg = "No result URLs in Kie callback";
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      errorMsg
    );
    console.error(
      `[Webhook/Kie] Generation ${generation.id}: ${errorMsg}`
    );
    return NextResponse.json({ received: true, status: "failed" });
  }

  const seed = payload.data.info?.seeds?.[0] ?? 0;

  const videoResult = {
    video: { url: resultUrls[0] },
    seed,
  };

  waitUntil(processVideoResult(generation.id, videoResult));

  return NextResponse.json({ received: true, status: "processing" });
}
