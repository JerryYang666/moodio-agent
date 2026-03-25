/**
 * POST /api/auth/verify-otp
 * Verify OTP code and issue authentication tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userConsents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyOTP } from "@/lib/auth/otp";
import { generateAccessToken } from "@/lib/auth/jwt";
import { generateRefreshToken, createRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies } from "@/lib/auth/cookies";
import { setCloudFrontCookies } from "@/lib/auth/cloudfront-cookies";
import { getUserTeamMemberships } from "@/lib/teams";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, agreedToTerms } = body;

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

    // Log consent if this is a new user who agreed to terms
    if (agreedToTerms) {
      await db.insert(userConsents).values({
        userId,
        termsVersion: "2026-03-24",
        acceptedFromIp:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      });
    } else {
      // Verify existing users have prior consent on record
      const existingConsent = await db
        .select({ id: userConsents.id })
        .from(userConsents)
        .where(eq(userConsents.userId, userId))
        .limit(1);

      if (existingConsent.length === 0) {
        return NextResponse.json(
          { error: "You must agree to the terms and conditions" },
          { status: 400 }
        );
      }
    }

    // Generate tokens with full user information
    const teamMemberships = await getUserTeamMemberships(user[0].id);
    const accessToken = await generateAccessToken(
      user[0].id,
      user[0].email,
      user[0].roles as string[],
      user[0].firstName || undefined,
      user[0].lastName || undefined,
      teamMemberships
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
