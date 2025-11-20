import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken, generateAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { setAccessTokenCookie } from "@/lib/auth/cookies";

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
        // Remove 'new_user' role if present, or we can just rely on checking if names are set
        // For now, let's update the roles to remove new_user if we want to be explicit,
        // or we can just use the presence of names as the indicator.
        // Let's assuming 'new_user' role is the flag.
        roles: payload.roles?.filter((r: string) => r !== "new_user") || ["user"],
        updatedAt: new Date(),
      })
      .where(eq(users.id, payload.userId))
      .returning();

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate new access token with updated info
    const newAccessToken = await generateAccessToken(
      updatedUser.id,
      updatedUser.email,
      updatedUser.roles,
      updatedUser.firstName || undefined,
      updatedUser.lastName || undefined
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

    return response;

  } catch (error) {
    console.error("Error in /api/auth/onboarding:", error);
    return NextResponse.json(
      { error: "Failed to update user profile" },
      { status: 500 }
    );
  }
}

