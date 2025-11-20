/**
 * GET /api/test/protected
 * Test endpoint to verify authentication middleware works
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    // Get access token from cookie (checking headers for middleware-refreshed token)
    const requestHeaders = await headers();
    const accessToken = getAccessToken(request, requestHeaders);

    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify access token
    const payload = await verifyAccessToken(accessToken);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      message: "This is protected data",
      userId: payload.userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/test/protected:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
