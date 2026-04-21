import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getImageModel } from "@/lib/image/models";
import { calculateCost, parseImageQualityToNumber } from "@/lib/pricing";
import type { ImageQuality } from "@/lib/image/types";

/**
 * GET /api/image/cost
 * Calculate the cost for an image generation without actually generating.
 * Used for real-time cost preview as user selects options.
 *
 * Query params:
 * - modelId: string (required) - The image model ID
 * - resolution: number (optional, default 2) - 1, 2, or 4
 * - quality: string (optional, default "auto") - "auto" | "low" | "medium" | "high"
 *            or numeric 1|2|3. Only gpt-image-2 actually varies output by quality,
 *            but the pricing formula may use it.
 */
export async function GET(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const modelId = searchParams.get("modelId");

  if (!modelId) {
    return NextResponse.json(
      { error: "modelId is required" },
      { status: 400 }
    );
  }

  const model = getImageModel(modelId);
  if (!model) {
    return NextResponse.json(
      { error: `Unknown image model: ${modelId}` },
      { status: 400 }
    );
  }

  const resolutionRaw = searchParams.get("resolution");
  const resolution = resolutionRaw ? parseInt(resolutionRaw, 10) : 2;

  const qualityRaw = searchParams.get("quality");
  let quality: number;
  if (!qualityRaw) {
    quality = 2;
  } else if (
    qualityRaw === "auto" ||
    qualityRaw === "low" ||
    qualityRaw === "medium" ||
    qualityRaw === "high"
  ) {
    quality = parseImageQualityToNumber(qualityRaw as ImageQuality);
  } else {
    const parsed = parseInt(qualityRaw, 10);
    quality = Number.isFinite(parsed) && parsed >= 1 && parsed <= 3 ? parsed : 2;
  }

  try {
    const cost = await calculateCost(modelId, { resolution, quality });

    return NextResponse.json({
      cost,
      modelId,
      params: { resolution, quality },
    });
  } catch (error: any) {
    console.error("[Image Cost API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate cost" },
      { status: 500 }
    );
  }
}
