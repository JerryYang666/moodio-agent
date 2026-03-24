import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { userCredits, teamCredits } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  grantCredits,
  deductCredits,
  type AccountType,
} from "@/lib/credits";

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      userId,
      amount,
      description,
      accountType = "personal" as AccountType,
      teamId,
    } = body;

    const targetAccountType = accountType as AccountType;
    let targetAccountId: string;

    if (targetAccountType === "team") {
      if (!teamId) {
        return NextResponse.json(
          { error: "teamId is required for team accounts" },
          { status: 400 }
        );
      }
      targetAccountId = teamId;
    } else {
      if (!userId) {
        return NextResponse.json(
          { error: "userId is required for personal accounts" },
          { status: 400 }
        );
      }
      targetAccountId = userId;
    }

    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { error: "amount is required" },
        { status: 400 }
      );
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum === 0) {
      return NextResponse.json(
        { error: "Amount must be a non-zero number" },
        { status: 400 }
      );
    }

    if (amountNum > 0) {
      await grantCredits(
        targetAccountId,
        amountNum,
        "admin_grant",
        description || null,
        payload.userId,
        undefined,
        targetAccountType
      );
    } else {
      await deductCredits(
        targetAccountId,
        Math.abs(amountNum),
        "admin_grant",
        description || null,
        payload.userId,
        undefined,
        targetAccountType
      );
    }

    // Get updated balance from the appropriate table
    let balance = 0;
    if (targetAccountType === "team") {
      const [record] = await db
        .select()
        .from(teamCredits)
        .where(eq(teamCredits.teamId, targetAccountId))
        .limit(1);
      balance = record?.balance ?? 0;
    } else {
      const [record] = await db
        .select()
        .from(userCredits)
        .where(eq(userCredits.userId, targetAccountId))
        .limit(1);
      balance = record?.balance ?? 0;
    }

    return NextResponse.json({
      success: true,
      balance,
      accountType: targetAccountType,
      accountId: targetAccountId,
    });
  } catch (error: any) {
    console.error("Error adjusting credits:", error);

    if (error.name === "InsufficientCreditsError") {
      return NextResponse.json(
        { error: "Insufficient credits for deduction" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to adjust credits" },
      { status: 500 }
    );
  }
}
