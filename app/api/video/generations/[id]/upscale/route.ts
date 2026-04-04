import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { KIE_API_BASE, kieAuthHeaders } from "@/lib/kie/client";
import {
  downloadFromUrl,
  uploadVideo,
  generateVideoId,
  getVideoUrl,
  getSignedVideoUrl,
} from "@/lib/storage/s3";
import {
  deductCredits,
  assertSufficientCredits,
  getActiveAccount,
  InsufficientCreditsError,
} from "@/lib/credits";

const VEO_MODEL_IDS = new Set(["veo-3.1", "veo-3.1-first-last-frame"]);

const UPSCALE_COSTS: Record<string, number> = {
  "1080p": 5,
  "4k": 100,
};

const PARAMS_KEY_1080P = "_upscaled_1080p_video_id";
const PARAMS_KEY_4K = "_upscaled_4k_video_id";

function getParamsKey(resolution: string): string {
  return resolution === "1080p" ? PARAMS_KEY_1080P : PARAMS_KEY_4K;
}

async function saveVideoToS3(remoteUrl: string): Promise<string> {
  const buffer = await downloadFromUrl(remoteUrl);
  const videoId = generateVideoId();
  await uploadVideo(buffer, "video/mp4", videoId);
  console.log(`[Veo Upscale] Saved upscaled video to S3: ${videoId} (${buffer.length} bytes)`);
  return videoId;
}

async function storeUpscaledVideoId(
  generationId: string,
  currentParams: Record<string, any>,
  paramsKey: string,
  videoId: string
) {
  const updatedParams = { ...currentParams, [paramsKey]: videoId };
  await db
    .update(videoGenerations)
    .set({ params: updatedParams })
    .where(eq(videoGenerations.id, generationId));
}

/**
 * POST /api/video/generations/[id]/upscale
 * Request a 1080p or 4K upscale for a completed Veo 3.1 generation via KIE.
 * Downloads the result and persists it to S3. Subsequent requests return the
 * cached version without hitting KIE or charging credits again.
 *
 * Body: { resolution: "1080p" | "4k" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const resolution = body.resolution as string;

  if (resolution !== "1080p" && resolution !== "4k") {
    return NextResponse.json(
      { error: "resolution must be '1080p' or '4k'" },
      { status: 400 }
    );
  }

  const [generation] = await db
    .select()
    .from(videoGenerations)
    .where(
      and(
        eq(videoGenerations.id, id),
        eq(videoGenerations.userId, payload.userId)
      )
    )
    .limit(1);

  if (!generation) {
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 }
    );
  }

  if (generation.status !== "completed") {
    return NextResponse.json(
      { error: "Generation is not completed" },
      { status: 422 }
    );
  }

  if (generation.provider !== "kie") {
    return NextResponse.json(
      { error: "Upscale is only available for KIE provider" },
      { status: 422 }
    );
  }

  if (!VEO_MODEL_IDS.has(generation.modelId)) {
    return NextResponse.json(
      { error: "Upscale is only available for Veo 3.1 models" },
      { status: 422 }
    );
  }

  const taskId = generation.providerRequestId;
  if (!taskId) {
    return NextResponse.json(
      { error: "No provider task ID found" },
      { status: 422 }
    );
  }

  const paramsKey = getParamsKey(resolution);
  const genParams = (generation.params ?? {}) as Record<string, any>;
  const existingVideoId = genParams[paramsKey] as string | undefined;

  if (existingVideoId) {
    return NextResponse.json({
      status: "ready",
      videoId: existingVideoId,
      videoUrl: getVideoUrl(existingVideoId),
      signedVideoUrl: getSignedVideoUrl(existingVideoId),
    });
  }

  const cost = UPSCALE_COSTS[resolution];

  try {
    const account = await getActiveAccount(payload.userId, payload);
    await assertSufficientCredits(account.accountId, cost, account.accountType);

    if (resolution === "1080p") {
      const res = await fetch(
        `${KIE_API_BASE}/api/v1/veo/get-1080p-video?taskId=${encodeURIComponent(taskId)}&index=0`,
        { method: "GET", headers: kieAuthHeaders() }
      );
      const json = await res.json();

      if (json.code === 200 && json.data?.resultUrl) {
        const videoId = await saveVideoToS3(json.data.resultUrl);
        await storeUpscaledVideoId(generation.id, genParams, paramsKey, videoId);
        await deductCredits(
          account.accountId,
          cost,
          "video_upscale",
          `Upscaled Veo 3.1 video to 1080p`,
          account.performedBy,
          { type: "video_generation", id: generation.id },
          account.accountType
        );
        return NextResponse.json({
          status: "ready",
          videoId,
          videoUrl: getVideoUrl(videoId),
          signedVideoUrl: getSignedVideoUrl(videoId),
        });
      }

      return NextResponse.json({
        status: "processing",
        message: json.msg || "1080p video is being processed. Please try again in 20-30 seconds.",
      });
    }

    // 4K — POST request
    const res = await fetch(`${KIE_API_BASE}/api/v1/veo/get-4k-video`, {
      method: "POST",
      headers: kieAuthHeaders(),
      body: JSON.stringify({ taskId, index: 0 }),
    });
    const json = await res.json();

    if (json.code === 200 && json.data?.resultUrls?.length) {
      const videoId = await saveVideoToS3(json.data.resultUrls[0]);
      await storeUpscaledVideoId(generation.id, genParams, paramsKey, videoId);
      await deductCredits(
        account.accountId,
        cost,
        "video_upscale",
        `Upscaled Veo 3.1 video to 4K`,
        account.performedBy,
        { type: "video_generation", id: generation.id },
        account.accountType
      );
      return NextResponse.json({
        status: "ready",
        videoId,
        videoUrl: getVideoUrl(videoId),
        signedVideoUrl: getSignedVideoUrl(videoId),
      });
    }

    // 422 with resultUrls = already generated on KIE side, save to our S3
    if (json.code === 422 && json.data?.resultUrls?.length) {
      const videoId = await saveVideoToS3(json.data.resultUrls[0]);
      await storeUpscaledVideoId(generation.id, genParams, paramsKey, videoId);
      await deductCredits(
        account.accountId,
        cost,
        "video_upscale",
        `Upscaled Veo 3.1 video to 4K`,
        account.performedBy,
        { type: "video_generation", id: generation.id },
        account.accountType
      );
      return NextResponse.json({
        status: "ready",
        videoId,
        videoUrl: getVideoUrl(videoId),
        signedVideoUrl: getSignedVideoUrl(videoId),
      });
    }

    // 422 without resultUrls = still processing, do NOT charge yet
    if (json.code === 422) {
      return NextResponse.json({
        status: "processing",
        message: json.msg || "4K video is being processed. Please try again in 30+ seconds.",
      });
    }

    return NextResponse.json({
      status: "processing",
      message: json.msg || "4K video is being processed. Please try again later.",
    });
  } catch (error: any) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 }
      );
    }
    console.error("[Veo Upscale] Error:", error);
    return NextResponse.json(
      { error: "Failed to request upscale" },
      { status: 500 }
    );
  }
}
