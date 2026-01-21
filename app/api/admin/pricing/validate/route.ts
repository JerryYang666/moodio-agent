import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { validateFormula, evaluateFormula } from "@/lib/pricing";

/**
 * POST /api/admin/pricing/validate
 * Validate and test a pricing formula without saving it
 *
 * Body:
 * - formula: string (required) - expr-eval expression
 * - testParams: object (optional) - params to test with
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
    const { formula, testParams } = body;

    if (!formula) {
      return NextResponse.json(
        { error: "formula is required" },
        { status: 400 }
      );
    }

    // Validate syntax
    const validation = validateFormula(formula, testParams);
    if (!validation.valid) {
      return NextResponse.json({
        valid: false,
        error: validation.error,
      });
    }

    // If test params provided, calculate result
    let testResult: number | undefined;
    if (testParams && Object.keys(testParams).length > 0) {
      testResult = evaluateFormula(formula, testParams);
    }

    return NextResponse.json({
      valid: true,
      testResult,
    });
  } catch (error: any) {
    console.error("[Admin Pricing Validate] Error:", error);
    return NextResponse.json(
      { error: error.message || "Validation failed" },
      { status: 500 }
    );
  }
}
