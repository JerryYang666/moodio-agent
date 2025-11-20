/**
 * POST /api/auth/logout
 * Logout user by invalidating refresh token
 */

import { NextRequest, NextResponse } from "next/server";
import { getRefreshToken, clearAuthCookies } from "@/lib/auth/cookies";
import { deleteRefreshToken } from "@/lib/auth/tokens";

export async function POST(request: NextRequest) {
  try {
    // Get refresh token from cookie
    const refreshToken = getRefreshToken(request);

    // Delete refresh token from database if it exists
    if (refreshToken) {
      await deleteRefreshToken(refreshToken);
    }

    // Create response
    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    // Clear authentication cookies
    clearAuthCookies(response);

    return response;
  } catch (error) {
    console.error("Error in logout:", error);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }
}
