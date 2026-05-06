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
 * ksyun callback payload. Ref: Kingsoft Cloud Kling v3 Omni callback docs.
 *
 * ksyun fires callbacks on each state transition (submitted → processing →
 * succeed/failed). No signature verification is offered — we gate on the
 * task_id lookup against our DB.
 */
interface KsyunCallbackPayload {
  task_id?: string;
  task_status?: "submitted" | "processing" | "succeed" | "failed";
  task_status_msg?: string;
  created_at?: number;
  updated_at?: number;
  final_unit_deduction?: string;
  task_info?: {
    external_task_id?: string;
  };
  task_result?: {
    videos?: Array<{ id?: string; url?: string; duration?: string }>;
  };
}

/**
 * POST /api/video/webhook/ksyun
 * Receives completion callbacks from ksyun. No signature verification.
 * Returns {code:0, msg:"ok"} per ksyun's expected format.
 */
export async function POST(request: NextRequest) {
  let payload: KsyunCallbackPayload;
  try {
    payload = await request.json();
  } catch (e) {
    console.error("[Webhook/ksyun] Failed to parse payload:", e);
    return NextResponse.json({ code: 1, msg: "Invalid payload" }, { status: 400 });
  }

  console.log(
    "[Webhook/ksyun] Received payload:",
    JSON.stringify(payload, null, 2)
  );

  const taskId = payload.task_id;
  if (!taskId) {
    console.error("[Webhook/ksyun] Missing task_id in payload");
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

  const status = payload.task_status;

  if (status === "submitted" || status === "processing") {
    console.log(
      `[Webhook/ksyun] Task ${taskId} still ${status}, ignoring intermediate callback`
    );
    return NextResponse.json({ code: 0, msg: "ok" });
  }

  if (status === "failed") {
    const errorMsg =
      payload.task_status_msg || "Generation failed on ksyun";
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

  if (status === "succeed") {
    const url = payload.task_result?.videos?.[0]?.url;
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

  console.warn(
    `[Webhook/ksyun] Unknown status "${status}" for task ${taskId}`
  );
  return NextResponse.json({ code: 0, msg: "ok" });
}
