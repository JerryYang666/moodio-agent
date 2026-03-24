import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { teamCredits } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { grantCredits, deductCredits } from "@/lib/credits";

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { teamId, amount, description } = body;

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
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
        teamId,
        amountNum,
        "admin_grant",
        description || null,
        payload.userId,
        undefined,
        "team"
      );
    } else {
      await deductCredits(
        teamId,
        Math.abs(amountNum),
        "admin_grant",
        description || null,
        payload.userId,
        undefined,
        "team"
      );
    }

    const [record] = await db
      .select()
      .from(teamCredits)
      .where(eq(teamCredits.teamId, teamId))
      .limit(1);

    return NextResponse.json({
      success: true,
      balance: record?.balance ?? 0,
    });
  } catch (error: any) {
    console.error("Error adjusting team credits:", error);

    if (error.name === "InsufficientCreditsError") {
      return NextResponse.json(
        { error: "Insufficient credits for deduction" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to adjust team credits" },
      { status: 500 }
    );
  }
}
