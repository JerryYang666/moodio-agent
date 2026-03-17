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
 *   "taskId": "...",
 *   "code": 200,
 *   "msg": "Success",
 *   "data": {
 *     "task_id": "...",
 *     "callbackType": "task_completed",
 *     "state": "success",
 *     "resultJson": "{\"resultUrls\":[\"https://...\"]}"
 *   }
 * }
 *
 * On failure:
 * {
 *   "taskId": "...",
 *   "code": 501,
 *   "msg": "Generation Failed",
 *   "data": {
 *     "task_id": "...",
 *     "state": "fail",
 *     "failCode": "...",
 *     "failMsg": "..."
 *   }
 * }
 */
interface KieWebhookPayload {
  taskId: string;
  code: number;
  msg: string;
  data: {
    task_id: string;
    callbackType?: string;
    state?: string;
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
  };
}

/**
 * POST /api/video/webhook/kie
 * Receives completion callbacks from Kie.
 * Verifies HMAC-SHA256 signature against KIE_WEBHOOK_HMAC_KEY.
 */
export async function POST(request: NextRequest) {
  const bodyBuffer = Buffer.from(await request.arrayBuffer());

  let payload: KieWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf-8"));
  } catch (e) {
    console.error("[Webhook/Kie] Failed to parse payload:", e);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const taskId = payload.data?.task_id;
  if (!taskId) {
    console.error("[Webhook/Kie] Missing data.task_id in payload");
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

  if (state !== "success") {
    console.log(
      `[Webhook/Kie] Non-terminal state "${state}" for generation ${generation.id}, ignoring`
    );
    return NextResponse.json({ received: true, status: "ignored" });
  }

  // Parse resultJson to extract video URL
  let resultUrls: string[] = [];
  try {
    if (payload.data.resultJson) {
      const parsed = JSON.parse(payload.data.resultJson);
      resultUrls = parsed.resultUrls ?? [];
    }
  } catch (e) {
    console.error("[Webhook/Kie] Failed to parse resultJson:", e);
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

  // Transform into the VideoGenerationResult shape our shared handler expects
  const videoResult = {
    video: { url: resultUrls[0] },
    seed: 0,
  };

  waitUntil(processVideoResult(generation.id, videoResult));

  return NextResponse.json({ received: true, status: "processing" });
}
