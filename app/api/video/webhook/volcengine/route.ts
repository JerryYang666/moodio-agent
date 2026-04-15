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
 * Volcengine callback payload shape.
 * The platform POSTs this to our callback_url on task status change.
 */
interface VolcengineCallbackPayload {
  id: string;
  model: string;
  status: "running" | "succeeded" | "failed" | "expired";
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * POST /api/video/webhook/volcengine
 * Receives task completion callbacks from Volcengine Ark API.
 *
 * TODO: Add webhook signature verification when Volcengine documents
 * their callback signing mechanism.
 */
export async function POST(request: NextRequest) {
  let payload: VolcengineCallbackPayload;
  try {
    payload = await request.json();
  } catch (e) {
    console.error("[Webhook/Volcengine] Failed to parse payload:", e);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log("[Webhook/Volcengine] Received payload:", JSON.stringify(payload, null, 2));
  console.log(
    `[Webhook/Volcengine] Received callback for task ${payload.id}, status: ${payload.status}`
  );

  const generation = await findGenerationByRequestId(payload.id);
  if (!generation) {
    console.error(
      `[Webhook/Volcengine] Generation not found for task ${payload.id}`
    );
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 }
    );
  }

  if (isTerminal(generation)) {
    console.log(
      `[Webhook/Volcengine] Generation ${generation.id} already ${generation.status}, skipping`
    );
    return NextResponse.json({ received: true, status: "already_processed" });
  }

  if (payload.status === "running") {
    console.log(
      `[Webhook/Volcengine] Task ${payload.id} still running, ignoring`
    );
    return NextResponse.json({ received: true, status: "in_progress" });
  }

  if (payload.status === "failed" || payload.status === "expired") {
    const errorMsg =
      payload.error?.message ||
      `Generation ${payload.status} on Volcengine`;
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      errorMsg
    );
    console.error(
      `[Webhook/Volcengine] Generation ${generation.id} failed:`,
      errorMsg
    );
    return NextResponse.json({ received: true, status: "failed" });
  }

  if (payload.status === "succeeded") {
    const videoUrl = payload.content?.video_url;
    if (!videoUrl) {
      const msg = "Volcengine callback succeeded but no video_url in payload";
      await handleGenerationFailure(
        generation.id,
        generation.userId,
        generation.modelId,
        msg
      );
      console.error(`[Webhook/Volcengine] ${msg}`);
      return NextResponse.json({ received: true, status: "failed" });
    }

    const result: VideoGenerationResult = {
      video: { url: videoUrl },
      seed: 0,
    };

    waitUntil(processVideoResult(generation.id, result));
    return NextResponse.json({ received: true, status: "processing" });
  }

  console.warn(
    `[Webhook/Volcengine] Unknown status "${payload.status}" for task ${payload.id}`
  );
  return NextResponse.json({ received: true, status: "ignored" });
}
