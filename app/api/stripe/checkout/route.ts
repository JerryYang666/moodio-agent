import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { subscriptionPlans, creditPackages, userConsents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe";

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for either a subscription or credit purchase.
 */
export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { mode, agreedToPaymentTerms } = body;

    if (mode !== "subscription" && mode !== "credits") {
      return NextResponse.json(
        { error: "mode must be 'subscription' or 'credits'" },
        { status: 400 }
      );
    }

    // Check if user has existing payment consent on record
    const [existingPaymentConsent] = await db
      .select({ id: userConsents.id })
      .from(userConsents)
      .where(
        and(
          eq(userConsents.userId, payload.userId),
          eq(userConsents.consentType, "payment")
        )
      )
      .limit(1);

    if (!existingPaymentConsent) {
      if (!agreedToPaymentTerms) {
        return NextResponse.json(
          { error: "You must agree to the payment terms", needsPaymentConsent: true },
          { status: 400 }
        );
      }

      // Record payment consent
      await db.insert(userConsents).values({
        userId: payload.userId,
        consentType: "payment",
        termsVersion: "2026-03-24",
        acceptedFromIp:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      });
    }

    const customerId = await getOrCreateStripeCustomer(
      payload.userId,
      payload.email
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (mode === "subscription") {
      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .limit(1);

      if (!plan) {
        return NextResponse.json(
          { error: "No active subscription plan configured" },
          { status: 404 }
        );
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        success_url: `${appUrl}/browse?checkout=success`,
        cancel_url: `${appUrl}/browse?checkout=canceled`,
        subscription_data: {
          metadata: { userId: payload.userId },
        },
        metadata: { userId: payload.userId },
      });

      return NextResponse.json({ url: session.url });
    }

    // mode === "credits"
    const { packageId } = body;
    if (!packageId) {
      return NextResponse.json(
        { error: "packageId is required for credit purchases" },
        { status: 400 }
      );
    }

    const [pkg] = await db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.id, packageId))
      .limit(1);

    if (!pkg || !pkg.isActive) {
      return NextResponse.json(
        { error: "Credit package not found or inactive" },
        { status: 404 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/credits?checkout=success`,
      cancel_url: `${appUrl}/credits?checkout=canceled`,
      payment_intent_data: {
        metadata: {
          userId: payload.userId,
          packageId: pkg.id,
          credits: String(pkg.credits),
        },
      },
      metadata: {
        userId: payload.userId,
        packageId: pkg.id,
        credits: String(pkg.credits),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("[Stripe Checkout] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
