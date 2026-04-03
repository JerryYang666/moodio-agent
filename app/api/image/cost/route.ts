import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getImageModel } from "@/lib/image/models";
import { calculateCost } from "@/lib/pricing";

/**
 * GET /api/image/cost
 * Calculate the cost for an image generation without actually generating.
 * Used for real-time cost preview as user selects options.
 *
 * Query params:
 * - modelId: string (required) - The image model ID
 * - resolution: number (optional, default 2) - 1, 2, or 4
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

  try {
    const cost = await calculateCost(modelId, { resolution });

    return NextResponse.json({
      cost,
      modelId,
      params: { resolution },
    });
  } catch (error: any) {
    console.error("[Image Cost API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate cost" },
      { status: 500 }
    );
  }
}
