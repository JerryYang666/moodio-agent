import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { stripe } from "@/lib/stripe";
import { getUserSubscription } from "@/lib/subscription";
import { handleStripeError } from "@/lib/stripe-errors";

/**
 * POST /api/stripe/resume
 * Re-enables a subscription that was scheduled for cancellation at period end.
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

    if (subscription.status === "canceled") {
      return NextResponse.json(
        { error: "Subscription is already canceled and cannot be resumed" },
        { status: 400 }
      );
    }

    if (!subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: "Subscription is not scheduled for cancellation" },
        { status: 400 }
      );
    }

    const updated = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      { cancel_at_period_end: false }
    );

    return NextResponse.json({
      success: true,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      currentPeriodEnd: new Date(
        (updated.items.data[0]?.current_period_end ?? updated.start_date) * 1000
      ).toISOString(),
    });
  } catch (error) {
    return handleStripeError(error, "Stripe Resume");
  }
}
