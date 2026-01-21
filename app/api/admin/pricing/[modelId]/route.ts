import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { deletePricingFormula } from "@/lib/pricing";

/**
 * DELETE /api/admin/pricing/:modelId
 * Delete a pricing formula
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { modelId } = await params;

    if (!modelId) {
      return NextResponse.json(
        { error: "modelId is required" },
        { status: 400 }
      );
    }

    // URL decode the modelId (it may contain slashes like "fal-ai/...")
    const decodedModelId = decodeURIComponent(modelId);

    await deletePricingFormula(decodedModelId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Pricing Delete] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete pricing formula" },
      { status: 500 }
    );
  }
}
