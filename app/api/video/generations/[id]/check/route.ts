import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { videoGenerations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { recoverGeneration } from "@/lib/video/recovery";

/**
 * POST /api/video/generations/[id]/check
 *
 * User-facing on-demand status check for ksyun (Kingsoft Cloud) generations.
 *
 * ksyun's webhook callbacks are not reliable yet, so a background poll runs on
 * every generations list fetch (see lib/video/recovery.ts). That poll can still
 * miss, leaving a video stuck in "processing". This endpoint lets the owner
 * force a reconcile of their own generation against the provider using the
 * exact same path the poll uses (recoverGeneration), so behaviour stays
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

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { id } = await params;

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
    console.error(`[ManualCheck] Error checking generation ${id}:`, error);
    return NextResponse.json(
      { error: "Failed to check generation status" },
      { status: 500 }
    );
  }
}
