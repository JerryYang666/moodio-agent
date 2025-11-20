/**
 * POST /api/auth/refresh
 * Refresh the access token using a valid refresh token
 * Uses unified refresh logic for consistent behavior
 */

import { NextRequest, NextResponse } from "next/server";
import { getRefreshToken, setAuthCookies } from "@/lib/auth/cookies";
import { refreshAccessToken } from "@/lib/auth/tokens";

export async function POST(request: NextRequest) {
  try {
    // Get refresh token from cookie
    const refreshToken = getRefreshToken(request);

    if (!refreshToken) {
      return NextResponse.json(
        { error: "No refresh token provided" },
        { status: 401 }
      );
    }

    // Use unified refresh logic
    const result = await refreshAccessToken(refreshToken);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to refresh token" },
        { status: 401 }
      );
    }

    // Create response with new tokens
    const response = NextResponse.json({
      success: true,
    });

    // Set both new access and refresh token cookies (single-use refresh tokens)
    setAuthCookies(response, result.accessToken!, result.refreshToken!);

    return response;
  } catch (error) {
    console.error("Error in refresh:", error);
    return NextResponse.json(
      { error: "Failed to refresh token" },
      { status: 500 }
    );
  }
}
