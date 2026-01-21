import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  getAllPricingFormulas,
  savePricingFormula,
  validateFormula,
} from "@/lib/pricing";
import { VIDEO_MODELS } from "@/lib/video/models";

/**
 * GET /api/admin/pricing
 * List all pricing formulas and available models
 */
export async function GET(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formulas = await getAllPricingFormulas();

    // Include model info for reference
    const models = VIDEO_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      params: m.params
        .filter((p) => !p.status || p.status === "active")
        .map((p) => ({
          name: p.name,
          type: p.type,
          options: p.options,
          default: p.default,
        })),
    }));

    return NextResponse.json({
      formulas,
      models,
    });
  } catch (error: any) {
    console.error("[Admin Pricing] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing formulas" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/pricing
 * Create or update a pricing formula
 *
 * Body:
 * - modelId: string (required)
 * - formula: string (required) - expr-eval expression
 * - description: string (optional)
 */
export async function POST(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { modelId, formula, description } = body;

    if (!modelId || !formula) {
      return NextResponse.json(
        { error: "modelId and formula are required" },
        { status: 400 }
      );
    }

    // Validate the formula
    const validation = validateFormula(formula);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid formula: ${validation.error}` },
        { status: 400 }
      );
    }

    await savePricingFormula(modelId, formula, description);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Pricing] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save pricing formula" },
      { status: 500 }
    );
  }
}
