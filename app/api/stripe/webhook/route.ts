import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions, users, teams, creditTransactions, stripeEvents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { grantCredits, type AccountType } from "@/lib/credits";

/**
 * POST /api/stripe/webhook
 * Handles incoming Stripe webhook events.
 * Must read the raw body for signature verification.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  // Log every event for audit before processing
  try {
    const dataObj = event.data.object as Record<string, any>;
    const stripeCustomerId =
      typeof dataObj.customer === "string" ? dataObj.customer : null;
    let userId: string | null = dataObj.metadata?.userId ?? null;
    if (!userId && stripeCustomerId) {
      userId = await resolveUserIdFromCustomer(stripeCustomerId);
    }
    await db.insert(stripeEvents).values({
      stripeEventId: event.id,
      eventType: event.type,
      userId,
      stripeCustomerId,
      metadata: dataObj,
    }).onConflictDoNothing();
  } catch (logErr) {
    console.error("[Stripe Webhook] Failed to log event:", logErr);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

/**
 * Handle completed checkout sessions.
 * For one-time (credit) payments, validate metadata and target account,
 * grant credits on success, or auto-refund if anything is invalid.
 * Subscription fulfillment is handled by the subscription.* events.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment") return;

  const userId = session.metadata?.userId;
  const credits = Number(session.metadata?.credits);
  const packageId = session.metadata?.packageId;
  const accountType = session.metadata?.accountType as AccountType | undefined;
  const accountId = session.metadata?.accountId;

  // Step 1: Validate all required metadata is present
  if (!userId || !credits || !packageId || !accountType || !accountId) {
    console.error("[Stripe Webhook] Missing required metadata on checkout session:", {
      sessionId: session.id,
      userId,
      credits,
      packageId,
      accountType,
      accountId,
    });
    await autoRefund(session, "missing_metadata");
    return;
  }

  if (accountType !== "personal" && accountType !== "team") {
    console.error("[Stripe Webhook] Invalid accountType in metadata:", {
      sessionId: session.id,
      accountType,
    });
    await autoRefund(session, "invalid_account_type");
    return;
  }

  // Step 2: Validate target account exists in DB
  const accountExists = await verifyAccountExists(accountType, accountId);
  if (!accountExists) {
    console.error("[Stripe Webhook] Target account does not exist:", {
      sessionId: session.id,
      accountType,
      accountId,
    });
    await autoRefund(session, "account_not_found");
    return;
  }

  // Idempotency: check if we already granted credits for this session
  const [existing] = await db
    .select({ id: creditTransactions.id })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.relatedEntityType, "stripe_checkout"),
        eq(creditTransactions.relatedEntityId, session.id)
      )
    )
    .limit(1);

  if (existing) return;

  // Step 3: Grant credits or refund — must be one or the other
  try {
    await grantCredits(
      accountId as string,
      credits,
      "purchase",
      `Purchased ${credits} credits`,
      userId,
      { type: "stripe_checkout", id: session.id },
      accountType as AccountType
    );
  } catch (grantErr) {
    console.error("[Stripe Webhook] grantCredits failed, triggering auto-refund:", {
      sessionId: session.id,
      accountType,
      accountId,
      error: grantErr,
    });
    await autoRefund(session, "grant_credits_failed");
  }
}

async function verifyAccountExists(
  accountType: AccountType,
  accountId: string
): Promise<boolean> {
  if (accountType === "personal") {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, accountId))
      .limit(1);
    return !!user;
  }

  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.id, accountId))
    .limit(1);
  return !!team;
}

async function autoRefund(session: Stripe.Checkout.Session, reason: string) {
  const piId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;

  if (!piId) {
    console.error("[Stripe Webhook] Cannot refund -- no payment_intent on session:", session.id);
    return;
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: piId,
      metadata: { autoRefundReason: reason, sessionId: session.id },
    });
    console.error("[Stripe Webhook] Auto-refunded payment:", {
      sessionId: session.id,
      refundId: refund.id,
      reason,
    });
  } catch (err) {
    console.error("[Stripe Webhook] CRITICAL: Auto-refund FAILED:", {
      sessionId: session.id,
      paymentIntentId: piId,
      reason,
      error: err,
    });
  }
}

/**
 * Upsert subscription state from Stripe into our database.
 */
async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId ?? await resolveUserIdFromCustomer(sub.customer as string);
  if (!userId) {
    console.error("[Stripe Webhook] Cannot resolve userId for subscription:", sub.id);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? "";
  const item = sub.items.data[0];
  const values = {
    userId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    status: sub.status,
    currentPeriodStart: new Date((item?.current_period_start ?? sub.start_date) * 1000),
    currentPeriodEnd: new Date((item?.current_period_end ?? sub.start_date) * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeSubscriptionId: values.stripeSubscriptionId,
        stripePriceId: values.stripePriceId,
        status: values.status,
        currentPeriodStart: values.currentPeriodStart,
        currentPeriodEnd: values.currentPeriodEnd,
        cancelAtPeriodEnd: values.cancelAtPeriodEnd,
        updatedAt: values.updatedAt,
      },
    });
}

/**
 * Mark a subscription as canceled.
 */
async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  await db
    .update(subscriptions)
    .set({ status: "canceled", cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
}

/**
 * Resolve a userId from a Stripe Customer ID by looking up our users table.
 */
async function resolveUserIdFromCustomer(customerId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  return user?.id ?? null;
}
