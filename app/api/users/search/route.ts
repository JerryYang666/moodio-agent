import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email query parameter is required" }, { status: 400 });
    }

    // Find user by exact email
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error searching user:", error);
    return NextResponse.json({ error: "Failed to search user" }, { status: 500 });
  }
}

