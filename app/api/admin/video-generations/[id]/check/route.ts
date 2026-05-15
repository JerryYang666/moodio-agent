import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recoverGeneration } from "@/lib/video/recovery";

/**
 * POST /api/admin/video-generations/[id]/check
 *
 * Admin on-demand status check for ksyun (Kingsoft Cloud) generations that
 * are still pending/processing.
 *
 * ksyun's webhook callbacks are not reliable yet, so the background poll
 * (see lib/video/recovery.ts) can miss and leave a video stuck in
 * "processing". `/recover` only handles already-`failed` rows; this lets an
 * admin force a reconcile of a still-running generation against the provider
 * using the same path the poll uses (recoverGeneration), so behaviour stays
 * consistent with the automatic poll.
 *
 * Restricted to the ksyun provider because that is the only provider whose
 * callback is unreliable; every other provider's webhook is trusted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  if (generation.provider !== "ksyun") {
    return NextResponse.json(
      {
        error:
          "Manual check is only available for Kingsoft Cloud generations",
      },
      { status: 422 }
    );
  }

  if (generation.status === "completed" || generation.status === "failed") {
    return NextResponse.json({ status: generation.status });
  }

  if (!generation.providerRequestId) {
    return NextResponse.json(
      { error: "Generation has no provider request ID — cannot check" },
      { status: 422 }
    );
  }

  try {
    const result = await recoverGeneration(generation);
    return NextResponse.json({
      status: result.status,
      recovered: result.recovered,
      error: result.error,
    });
  } catch (error) {
    console.error(`[AdminManualCheck] Error checking generation ${id}:`, error);
    return NextResponse.json(
      { error: "Failed to check generation status" },
      { status: 500 }
    );
  }
}
