/**
 * POST /api/auth/verify-otp
 * Verify OTP code and issue authentication tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyOTP } from "@/lib/auth/otp";
import { generateAccessToken } from "@/lib/auth/jwt";
import { generateRefreshToken, createRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies } from "@/lib/auth/cookies";
import { setCloudFrontCookies } from "@/lib/auth/cloudfront-cookies";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body;

    // Validate input
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    // Find user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json(
        { error: "Invalid email or code" },
        { status: 401 }
      );
    }

    const userId = user[0].id;

    // Verify OTP
    const isValid = await verifyOTP(userId, code);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid or expired code" },
        { status: 401 }
      );
    }

    // Generate tokens with full user information
    const accessToken = await generateAccessToken(
      user[0].id,
      user[0].email,
      user[0].roles as string[],
      user[0].firstName || undefined,
      user[0].lastName || undefined
    );
    const refreshToken = generateRefreshToken();

    // Save refresh token to database
    await createRefreshToken(userId, refreshToken);

    // Create response with cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: user[0].id,
        email: user[0].email,
        firstName: user[0].firstName,
        lastName: user[0].lastName,
        roles: user[0].roles,
      },
    });

    // Set authentication cookies
    setAuthCookies(response, accessToken, refreshToken);
    setCloudFrontCookies(response);

    return response;
  } catch (error) {
    console.error("Error in verify-otp:", error);
    return NextResponse.json(
      { error: "Failed to verify OTP" },
      { status: 500 }
    );
  }
}
