import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { creditTransactions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { grantCredits, getUserBalance } from "@/lib/credits";

const DAILY_CHECKIN_AMOUNT = 100;

function getUTCDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function getNextUTCDayStart(date: Date): Date {
  const start = getUTCDayStart(date);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

async function getLastCheckin(userId: string) {
  const [last] = await db
    .select()
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.accountId, userId),
        eq(creditTransactions.accountType, "personal"),
        eq(creditTransactions.type, "daily_checkin")
      )
    )
    .orderBy(desc(creditTransactions.createdAt))
    .limit(1);
  return last;
}

function isCheckinAvailable(lastCheckin: { createdAt: Date } | undefined): boolean {
  if (!lastCheckin) return true;
  const todayStart = getUTCDayStart(new Date());
  return lastCheckin.createdAt < todayStart;
}

/**
 * GET /api/users/credits/daily-checkin
 * Check if the daily check-in is available
 */
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

    const lastCheckin = await getLastCheckin(payload.userId);
    const available = isCheckinAvailable(lastCheckin);

    return NextResponse.json({
      available,
      amount: DAILY_CHECKIN_AMOUNT,
      nextAvailable: available ? null : getNextUTCDayStart(new Date()).toISOString(),
    });
  } catch (error) {
    console.error("Error checking daily check-in:", error);
    return NextResponse.json(
      { error: "Failed to check daily check-in status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users/credits/daily-checkin
 * Claim the daily check-in credits
 */
export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const lastCheckin = await getLastCheckin(payload.userId);

    if (!isCheckinAvailable(lastCheckin)) {
      return NextResponse.json({
        success: false,
        alreadyClaimed: true,
        nextAvailable: getNextUTCDayStart(new Date()).toISOString(),
      });
    }

    await grantCredits(
      payload.userId,
      DAILY_CHECKIN_AMOUNT,
      "daily_checkin",
      "Daily check-in reward"
    );

    const balance = await getUserBalance(payload.userId);

    return NextResponse.json({
      success: true,
      amount: DAILY_CHECKIN_AMOUNT,
      balance,
    });
  } catch (error) {
    console.error("Error claiming daily check-in:", error);
    return NextResponse.json(
      { error: "Failed to claim daily check-in" },
      { status: 500 }
    );
  }
}
