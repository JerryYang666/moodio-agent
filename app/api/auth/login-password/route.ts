import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, dummyVerify } from "@/lib/auth/password";
import { generateAccessToken } from "@/lib/auth/jwt";
import { generateRefreshToken, createRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies } from "@/lib/auth/cookies";
import { setCloudFrontCookies } from "@/lib/auth/cloudfront-cookies";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

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

    const accessToken = await generateAccessToken(
      user[0].id,
      user[0].email,
      user[0].roles as string[],
      user[0].firstName || undefined,
      user[0].lastName || undefined
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
