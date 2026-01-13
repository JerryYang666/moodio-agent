import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getAllModelsForApi, DEFAULT_VIDEO_MODEL_ID } from "@/lib/video/models";

/**
 * GET /api/video/models
 * Returns available video models and their configurations
 * Used by frontend to render dynamic generation forms
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

  const models = getAllModelsForApi();

  return NextResponse.json({
    models,
    defaultModelId: DEFAULT_VIDEO_MODEL_ID,
  });
}
