import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/admin/subscriptions/grant
 * Admin-only: grant a Moodio Pro subscription to a user for N months.
 * Creates or replaces the subscription row with status "admin_granted".
 */
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
    const { userId, months } = body;

    if (!userId || !months || months < 1 || months > 120) {
      return NextResponse.json(
        { error: "userId and months (1-120) are required" },
        { status: 400 }
      );
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + months);

    const existing = await db
      .select({ id: subscriptions.id, currentPeriodEnd: subscriptions.currentPeriodEnd, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    let result;

    if (existing.length > 0) {
      const isCurrentlyActive =
        (existing[0].status === "active" ||
          existing[0].status === "trialing" ||
          existing[0].status === "admin_granted") &&
        new Date(existing[0].currentPeriodEnd) > now;

      let newEnd: Date;
      if (isCurrentlyActive) {
        newEnd = new Date(existing[0].currentPeriodEnd);
        newEnd.setMonth(newEnd.getMonth() + months);
      } else {
        newEnd = periodEnd;
      }

      [result] = await db
        .update(subscriptions)
        .set({
          status: "admin_granted",
          currentPeriodStart: now,
          currentPeriodEnd: newEnd,
          cancelAtPeriodEnd: false,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existing[0].id))
        .returning();
    } else {
      [result] = await db
        .insert(subscriptions)
        .values({
          userId,
          stripeSubscriptionId: `admin_grant_${userId}_${Date.now()}`,
          stripePriceId: "admin_granted",
          status: "admin_granted",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        })
        .returning();
    }

    return NextResponse.json({
      subscription: result,
      message: `Granted ${months} month(s) of Moodio Pro`,
    });
  } catch (error: any) {
    console.error("[Admin Grant Subscription] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to grant subscription" },
      { status: 500 }
    );
  }
}
