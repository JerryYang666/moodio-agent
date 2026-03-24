import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken, generateAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { setAccessTokenCookie } from "@/lib/auth/cookies";
import { setCloudFrontCookies } from "@/lib/auth/cloudfront-cookies";
import { grantCredits } from "@/lib/credits";
import { getUserTeamMemberships } from "@/lib/teams";

const SIGNUP_BONUS_CREDITS = 300;

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);

    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { firstName, lastName } = body;

    // Update user in database
    const [updatedUser] = await db
      .update(users)
      .set({
        firstName: firstName || null,
        lastName: lastName || null,
        roles: [...(payload.roles || []).filter((r: string) => r !== "new_user" && r !== "user"), "user"],
        updatedAt: new Date(),
      })
      .where(eq(users.id, payload.userId))
      .returning();

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Grant new user signup bonus credits
    if (payload.roles?.includes("new_user")) {
      await grantCredits(
        updatedUser.id,
        SIGNUP_BONUS_CREDITS,
        "signup_bonus",
        "New user signup bonus"
      );
    }

    // Generate new access token with updated info
    const teamMemberships = await getUserTeamMemberships(updatedUser.id);
    const newAccessToken = await generateAccessToken(
      updatedUser.id,
      updatedUser.email,
      updatedUser.roles,
      updatedUser.firstName || undefined,
      updatedUser.lastName || undefined,
      teamMemberships
    );

    const response = NextResponse.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        roles: updatedUser.roles,
        authProvider: updatedUser.authProvider,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });

    // Update the cookie
    setAccessTokenCookie(response, newAccessToken);
    setCloudFrontCookies(response);

    return response;

  } catch (error) {
    console.error("Error in /api/auth/onboarding:", error);
    return NextResponse.json(
      { error: "Failed to update user profile" },
      { status: 500 }
    );
  }
}

