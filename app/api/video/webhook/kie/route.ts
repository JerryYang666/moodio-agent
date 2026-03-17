import { NextRequest, NextResponse } from "next/server";
import { shouldSkipVerification } from "@/lib/video/webhook-verify";
import type { VideoGenerationResult } from "@/lib/video/providers";
import {
  findGenerationByRequestId,
  isTerminal,
  handleGenerationFailure,
  processVideoResult,
} from "@/lib/video/webhook-handler";
import { waitUntil } from "@vercel/functions";

/**
 * TODO: Implement kie-specific signature verification.
 * Replace this stub once kie's verification method is known.
 */
async function verifyKieWebhook(
  _headers: Headers,
  _body: Buffer
): Promise<boolean> {
  console.warn("[Webhook/Kie] Signature verification not yet implemented");
  return false;
}

/**
 * Kie webhook payload structure.
 * TODO: Update to match actual kie payload format once known.
 * For now, we assume the same shape as Fal for scaffolding purposes.
 */
interface KieWebhookPayload {
  request_id: string;
  status: "OK" | "ERROR";
  payload?: VideoGenerationResult | null;
  error?: string;
}

/**
 * POST /api/video/webhook/kie
 * Receives completion callbacks from Kie.
 * TODO: Implement actual kie signature verification.
 */
export async function POST(request: NextRequest) {
  const bodyBuffer = Buffer.from(await request.arrayBuffer());

  if (!shouldSkipVerification()) {
    const isValid = await verifyKieWebhook(request.headers, bodyBuffer);
    if (!isValid) {
      console.error("[Webhook/Kie] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[Webhook/Kie] Skipping signature verification in development");
  }

  let payload: KieWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf-8"));
  } catch (e) {
    console.error("[Webhook/Kie] Failed to parse payload:", e);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const {
    request_id: requestId,
    status,
    payload: resultPayload,
    error,
  } = payload;

  console.log(
    `[Webhook/Kie] Received callback for request ${requestId}, status: ${status}`
  );

  const generation = await findGenerationByRequestId(requestId);
  if (!generation) {
    console.error(
      `[Webhook/Kie] Generation not found for request ${requestId}`
    );
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

  if (status === "ERROR") {
    const errorMsg = error || "Unknown error from Kie";
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      errorMsg
    );
    console.error(`[Webhook/Kie] Generation ${generation.id} failed:`, errorMsg);
    return NextResponse.json({ received: true, status: "failed" });
  }

  if (!resultPayload) {
    const errorMsg = "No result payload received";
    await handleGenerationFailure(
      generation.id,
      generation.userId,
      generation.modelId,
      errorMsg
    );
    console.error(
      `[Webhook/Kie] Generation ${generation.id} payload error:`,
      errorMsg
    );
    return NextResponse.json({ received: true, status: "failed" });
  }

  waitUntil(processVideoResult(generation.id, resultPayload));

  return NextResponse.json({ received: true, status: "processing" });
}
