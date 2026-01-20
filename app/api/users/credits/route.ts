import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { userCredits, creditTransactions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create user credits
    let credits = await db
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, payload.userId))
      .limit(1);

    if (credits.length === 0) {
      // Auto-create credits record with 0 balance
      const [newCredit] = await db
        .insert(userCredits)
        .values({
          userId: payload.userId,
          balance: 0,
        })
        .returning();
      credits = [newCredit];
    }

    // Get pagination params
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Get transaction history
    const transactions = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, payload.userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      balance: credits[0].balance,
      transactions,
    });
  } catch (error) {
    console.error("Error fetching user credits:", error);
    return NextResponse.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
