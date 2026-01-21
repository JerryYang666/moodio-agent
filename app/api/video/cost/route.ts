import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getVideoModel, validateAndMergeParams } from "@/lib/video/models";
import { calculateCost } from "@/lib/pricing";

/**
 * GET /api/video/cost
 * Calculate the cost for a video generation without actually generating.
 * Used for real-time cost preview as user selects options.
 *
 * Query params:
 * - modelId: string (required) - The video model ID
 * - Additional params as query string (e.g., resolution=1080p&duration=10)
 */
export async function GET(request: NextRequest) {
  // Verify authentication
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

  // Validate model exists
  const model = getVideoModel(modelId);
  if (!model) {
    return NextResponse.json(
      { error: `Unknown video model: ${modelId}` },
      { status: 400 }
    );
  }

  // Build params from query string
  const params: Record<string, any> = {};
  searchParams.forEach((value, key) => {
    if (key === "modelId") return;

    // Parse booleans
    if (value === "true") {
      params[key] = true;
    } else if (value === "false") {
      params[key] = false;
    } else {
      params[key] = value;
    }
  });

  try {
    // Merge with defaults (but skip image validation)
    const mergedParams = { ...params };

    // Add placeholder for required image params to pass validation
    if (model.imageParams.sourceImage && !mergedParams[model.imageParams.sourceImage]) {
      mergedParams[model.imageParams.sourceImage] = "placeholder";
    }

    // Get defaults for any missing params
    for (const param of model.params) {
      if (mergedParams[param.name] === undefined && param.default !== undefined) {
        mergedParams[param.name] = param.default;
      }
    }

    // Calculate cost
    const cost = await calculateCost(modelId, mergedParams);

    return NextResponse.json({
      cost,
      modelId,
      params: mergedParams,
    });
  } catch (error: any) {
    console.error("[Cost API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate cost" },
      { status: 500 }
    );
  }
}
