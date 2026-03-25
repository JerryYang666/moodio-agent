import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userConsents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, dummyVerify } from "@/lib/auth/password";
import { generateAccessToken } from "@/lib/auth/jwt";
import { generateRefreshToken, createRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies } from "@/lib/auth/cookies";
import { setCloudFrontCookies } from "@/lib/auth/cloudfront-cookies";
import { getUserTeamMemberships } from "@/lib/teams";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, agreedToTerms } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (user.length === 0 || !user[0].passwordHash) {
      // Timing-safe: consume roughly the same time as a real bcrypt verify
      await dummyVerify();
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user[0].passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Check consent status
    const existingConsent = await db
      .select({ id: userConsents.id })
      .from(userConsents)
      .where(eq(userConsents.userId, user[0].id))
      .limit(1);

    const hasConsent = existingConsent.length > 0;

    if (!hasConsent && !agreedToTerms) {
      return NextResponse.json(
        { error: "You must agree to the terms and conditions", needsConsent: true },
        { status: 400 }
      );
    }

    if (!hasConsent && agreedToTerms) {
      await db.insert(userConsents).values({
        userId: user[0].id,
        termsVersion: "2026-03-24",
        acceptedFromIp:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      });
    }

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

    await createRefreshToken(user[0].id, refreshToken);

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

    setAuthCookies(response, accessToken, refreshToken);
    setCloudFrontCookies(response);

    return response;
  } catch (error) {
    console.error("Error in login-password:", error);
    return NextResponse.json(
      { error: "Failed to authenticate" },
      { status: 500 }
    );
  }
}
