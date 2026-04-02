import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { hasActiveSubscription, getUserSubscription } from "@/lib/subscription";
import { db } from "@/lib/db";
import { userConsents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/users/subscription
 * Returns the current user's subscription status.
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

    const isActive = await hasActiveSubscription(payload.userId);
    const subscription = await getUserSubscription(payload.userId);

    // Check if user has payment consent on record
    const [paymentConsent] = await db
      .select({ id: userConsents.id })
      .from(userConsents)
      .where(
        and(
          eq(userConsents.userId, payload.userId),
          eq(userConsents.consentType, "payment")
        )
      )
      .limit(1);

    return NextResponse.json({
      hasActiveSubscription: isActive,
      hasPaymentConsent: !!paymentConsent,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
    });
  } catch (error: any) {
    console.error("[User Subscription] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}
