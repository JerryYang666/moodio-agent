import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(accessToken);
    if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { firstName, lastName } = await request.json();

    // Check if at least one field is provided, but allow empty strings to clear them if that's desired?
    // Usually clearing name is fine.
    if (firstName === undefined && lastName === undefined) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    await db.update(users)
      .set({ 
        firstName: firstName, 
        lastName: lastName,
        updatedAt: new Date() 
      })
      .where(eq(users.id, payload.userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

