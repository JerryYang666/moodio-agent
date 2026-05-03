import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { subscriptionPlans, creditPackages, userConsents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { stripe, getOrCreateStripeCustomer, sanitizeStatementDescriptorSuffix, buildFullStatementDescriptor } from "@/lib/stripe";
import { hasActiveSubscription } from "@/lib/subscription";
import { handleStripeError } from "@/lib/stripe-errors";

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
      const alreadySubscribed = await hasActiveSubscription(payload.userId);
      if (alreadySubscribed) {
        return NextResponse.json(
          { error: "You already have an active subscription" },
          { status: 409 }
        );
      }

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
          ...(plan.trialPeriodDays > 0
            ? { trial_period_days: plan.trialPeriodDays }
            : {}),
        },
        metadata: { userId: payload.userId },
      });

      return NextResponse.json({ url: session.url });
    }

    // mode === "credits"
    const { packageId, accountType, accountId } = body;
    if (!packageId) {
      return NextResponse.json(
        { error: "packageId is required for credit purchases" },
        { status: 400 }
      );
    }

    if (!accountType || !accountId) {
      return NextResponse.json(
        { error: "accountType and accountId are required" },
        { status: 400 }
      );
    }

    if (accountType !== "personal" && accountType !== "team") {
      return NextResponse.json(
        { error: "accountType must be 'personal' or 'team'" },
        { status: 400 }
      );
    }

    if (accountType === "personal" && accountId !== payload.userId) {
      return NextResponse.json(
        { error: "Cannot purchase credits for another user" },
        { status: 403 }
      );
    }

    if (accountType === "team") {
      const membership = payload.teams?.find((t) => t.id === accountId);
      if (!membership) {
        return NextResponse.json(
          { error: "You are not a member of this team" },
          { status: 403 }
        );
      }
      if (membership.role !== "owner" && membership.role !== "admin") {
        return NextResponse.json(
          { error: "Only team owners and admins can purchase credits for the team" },
          { status: 403 }
        );
      }
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

    const creditsMeta = {
      userId: payload.userId,
      packageId: pkg.id,
      credits: String(pkg.credits),
      accountType,
      accountId,
    };

    const successParams = new URLSearchParams({ checkout: "success", accountType, accountId });
    const cancelParams = new URLSearchParams({ checkout: "canceled" });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/credits?${successParams.toString()}`,
      cancel_url: `${appUrl}/credits?${cancelParams.toString()}`,
      payment_intent_data: {
        metadata: creditsMeta,
        statement_descriptor_suffix: sanitizeStatementDescriptorSuffix(pkg.name),
        statement_descriptor: buildFullStatementDescriptor(pkg.name),
      },
      metadata: creditsMeta,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return handleStripeError(error, "Stripe Checkout");
  }
}
