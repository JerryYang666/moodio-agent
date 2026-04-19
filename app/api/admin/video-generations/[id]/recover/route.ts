import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { tryRecoverVideoGeneration } from "@/lib/video/video-client";
import { downloadAndPersistVideo } from "@/lib/video/webhook-handler";
import { recordEvent } from "@/lib/telemetry";

/**
 * POST /api/admin/video-generations/[id]/recover
 *
 * Manually re-runs the post-generation pipeline for a generation that was
 * marked `failed` due to a transient webhook-side issue (most commonly,
 * a download timeout from the provider's CDN after the video had already
 * been generated successfully on the provider side).
 *
 * The provider is re-queried using the stored `providerRequestId`; if the
 * result is still fetchable we download it, persist it to S3, and flip the
 * row back to `completed`.
 *
 * Credits are intentionally NOT re-charged. The row was already refunded
 * when it failed, and recovering is a goodwill action — the user gets their
 * video AND keeps the refunded credits.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const auth = await verifyAccessToken(accessToken);
    if (!auth || !auth.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    const [generation] = await db
      .select()
      .from(videoGenerations)
      .where(eq(videoGenerations.id, id))
      .limit(1);

    if (!generation) {
      return NextResponse.json(
        { error: "Generation not found" },
        { status: 404 }
      );
    }

    if (generation.status !== "failed") {
      return NextResponse.json(
        {
          error: `Only failed generations can be recovered (current status: ${generation.status})`,
        },
        { status: 409 }
      );
    }

    if (!generation.providerRequestId || !generation.provider) {
      return NextResponse.json(
        {
          error:
            "Generation has no provider request ID — cannot recover from provider",
        },
        { status: 422 }
      );
    }

    const recoverProvider = generation.provider;
    const recoverProviderModelId =
      generation.providerModelId ?? generation.modelId;

    console.log(
      `[AdminRecover] Attempting recovery for generation ${generation.id} (provider: ${recoverProvider}, requestId: ${generation.providerRequestId})`
    );

    let recoveryResult;
    try {
      recoveryResult = await tryRecoverVideoGeneration(
        recoverProvider,
        recoverProviderModelId,
        generation.providerRequestId
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[AdminRecover] Provider query failed for generation ${generation.id}:`,
        error
      );
      return NextResponse.json(
        {
          status: "provider_error",
          error: `Provider query failed: ${msg}`,
        },
        { status: 502 }
      );
    }

    if (recoveryResult.status === "in_progress") {
      return NextResponse.json({
        status: "in_progress",
        message:
          "Provider reports the task is still running. Try again in a moment.",
      });
    }

    if (recoveryResult.status === "failed") {
      return NextResponse.json({
        status: "failed",
        error:
          recoveryResult.error ||
          "Provider reports the generation actually failed — no video to recover",
      });
    }

    if (recoveryResult.status !== "completed" || !recoveryResult.result) {
      return NextResponse.json({
        status: "unknown",
        error: "Provider returned no usable result",
      });
    }

    try {
      const { videoId } = await downloadAndPersistVideo(
        generation.id,
        recoveryResult.result,
        "[AdminRecover]"
      );

      await recordEvent("video_generation_recovery", generation.userId, {
        status: "completed",
        generationId: generation.id,
        modelId: generation.modelId,
        videoId,
        manual: true,
        performedBy: auth.userId,
      });

      console.log(
        `[AdminRecover] Generation ${generation.id} successfully recovered (videoId: ${videoId})`
      );

      return NextResponse.json({
        status: "completed",
        videoId,
        message: "Video recovered successfully. User was not re-charged.",
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to download/persist";
      console.error(
        `[AdminRecover] Download/persist failed for generation ${generation.id}:`,
        error
      );

      await recordEvent("video_generation_recovery", generation.userId, {
        status: "recovery_failed",
        generationId: generation.id,
        modelId: generation.modelId,
        error: msg,
        manual: true,
        performedBy: auth.userId,
      });

      return NextResponse.json(
        {
          status: "download_failed",
          error: `Could not download video from provider: ${msg}`,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("[AdminRecover] Unexpected error:", error);
    return NextResponse.json(
      { error: "Recovery failed unexpectedly" },
      { status: 500 }
    );
  }
}
