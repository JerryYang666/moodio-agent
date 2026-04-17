import { NextRequest, NextResponse } from "next/server";
import {
  verifyFalWebhook,
  extractWebhookHeaders,
  shouldSkipVerification,
} from "@/lib/video/webhook-verify";
import type { FalWebhookPayload } from "@/lib/video/video-client";
import type { VideoGenerationResult } from "@/lib/video/providers";
import {
  findGenerationByRequestId,
  isTerminal,
  handleGenerationFailure,
  processVideoResult,
} from "@/lib/video/webhook-handler";
import { waitUntil } from "@vercel/functions";

/**
 * POST /api/video/webhook/fal
 * Receives completion callbacks from Fal AI.
 * Verifies the ED25519 signature against Fal's JWKS public keys.
 */
export async function POST(request: NextRequest) {
  const bodyBuffer = Buffer.from(await request.arrayBuffer());
  const headers = extractWebhookHeaders(request.headers);

  if (!shouldSkipVerification()) {
    const isValid = await verifyFalWebhook(headers, bodyBuffer);
    if (!isValid) {
      console.error("[Webhook/Fal] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[Webhook/Fal] Skipping signature verification in development");
  }

  console.log("[Webhook/Fal] Received payload:", bodyBuffer.toString("utf-8"));

  let payload: FalWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf-8"));
  } catch (e) {
    console.error("[Webhook/Fal] Failed to parse payload:", e);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const {
    request_id: falRequestId,
    status,
    payload: resultPayload,
    error,
    payload_error,
  } = payload;

  console.log(
    `[Webhook/Fal] Received callback for request ${falRequestId}, status: ${status}`
  );

  let generation = await findGenerationByRequestId(falRequestId);
  if (!generation) {
    // Fal can fire the webhook before our submit request returns and
    // the DB row is committed. Wait briefly and retry once.
    console.warn(
      `[Webhook/Fal] Generation not found for request ${falRequestId}, retrying in 6s…`
    );
    await new Promise((r) => setTimeout(r, 6000));
    generation = await findGenerationByRequestId(falRequestId);
  }
  if (!generation) {
    console.error(
      `[Webhook/Fal] Generation still not found for request ${falRequestId} after retry`
    );
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 }
    );
  }

  if (isTerminal(generation)) {
    console.log(
      `[Webhook/Fal] Generation ${generation.id} already ${generation.status}, skipping`
    );
    return NextResponse.json({ received: true, status: "already_processed" });
  }

  if (status === "ERROR") {
    const detailMsg = Array.isArray(resultPayload?.detail)
      ? resultPayload.detail
          .map((d: { msg?: string; type?: string }) =>
            [d.type, d.msg].filter(Boolean).join(": ")
          )
          .join("; ")
      : undefined;
    const errorMsg =
      detailMsg || error || payload_error || "Unknown error from Fal";
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      errorMsg
    );
    console.error(`[Webhook/Fal] Generation ${generation.id} failed:`, errorMsg);
    return NextResponse.json({ received: true, status: "failed" });
  }

  if (payload_error || !resultPayload) {
    const errorMsg = payload_error || "No result payload received";
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      errorMsg
    );
    console.error(
      `[Webhook/Fal] Generation ${generation.id} payload error:`,
      errorMsg
    );
    return NextResponse.json({ received: true, status: "failed" });
  }

  waitUntil(
    processVideoResult(generation.id, resultPayload as VideoGenerationResult)
  );

  return NextResponse.json({ received: true, status: "processing" });
}
