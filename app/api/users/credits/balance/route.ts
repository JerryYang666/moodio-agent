import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { userCredits, teamCredits } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { AccountType } from "@/lib/credits";

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

    const { searchParams } = new URL(request.url);
    const accountType = (searchParams.get("accountType") || "personal") as AccountType;
    const accountId = searchParams.get("accountId");

    if (accountType === "team") {
      if (!accountId) {
        return NextResponse.json(
          { error: "accountId is required for team accounts" },
          { status: 400 }
        );
      }
      const membership = payload.teams?.find((t) => t.id === accountId);
      if (!membership) {
        return NextResponse.json(
          { error: "You are not a member of this team" },
          { status: 403 }
        );
      }

      const [record] = await db
        .select()
        .from(teamCredits)
        .where(eq(teamCredits.teamId, accountId))
        .limit(1);

      return NextResponse.json({
        balance: record?.balance ?? 0,
        accountType: "team",
        accountId,
      });
    }

    // Personal account (default)
    let credits = await db
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, payload.userId))
      .limit(1);

    if (credits.length === 0) {
      const [newCredit] = await db
        .insert(userCredits)
        .values({ userId: payload.userId, balance: 0 })
        .returning();
      credits = [newCredit];
    }

    return NextResponse.json({
      balance: credits[0].balance,
      accountType: "personal",
      accountId: payload.userId,
    });
  } catch (error) {
    console.error("Error fetching user credits balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch credits balance" },
      { status: 500 }
    );
  }
}
