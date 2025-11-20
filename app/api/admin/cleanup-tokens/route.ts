import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { deleteExpiredRefreshTokens } from "@/lib/auth/tokens";

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await deleteExpiredRefreshTokens();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cleaning up tokens:", error);
    return NextResponse.json(
      { error: "Failed to cleanup tokens" },
      { status: 500 }
    );
  }
}

