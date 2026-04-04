import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { stripe } from "@/lib/stripe";
import { getUserSubscription } from "@/lib/subscription";
import { handleStripeError } from "@/lib/stripe-errors";

/**
 * POST /api/stripe/cancel
 * Cancels the authenticated user's subscription at the end of the current billing period.
 */
export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscription = await getUserSubscription(payload.userId);
    if (!subscription || !subscription.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 }
      );
    }

    if (subscription.status === "admin_granted") {
      return NextResponse.json(
        { error: "Admin-granted subscriptions cannot be canceled from here. Contact an administrator." },
        { status: 400 }
      );
    }

    if (subscription.status === "canceled") {
      return NextResponse.json(
        { error: "Subscription is already canceled" },
        { status: 400 }
      );
    }

    // Cancel at the end of the current billing period (not immediately)
    const updated = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    return NextResponse.json({
      success: true,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      currentPeriodEnd: new Date(
        (updated.items.data[0]?.current_period_end ?? updated.start_date) * 1000
      ).toISOString(),
    });
  } catch (error) {
    return handleStripeError(error, "Stripe Cancel");
  }
}
