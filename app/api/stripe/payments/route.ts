import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { users, teams } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { handleStripeError } from "@/lib/stripe-errors";

/**
 * GET /api/stripe/payments
 * Returns the authenticated user's payment history: subscription invoices
 * and one-time credit purchases, all fetched from the Stripe API.
 */
export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user?.stripeCustomerId) {
      return NextResponse.json({ payments: [] });
    }

    const [invoices, creditPurchases] = await Promise.all([
      fetchInvoices(user.stripeCustomerId),
      fetchCreditPurchases(user.stripeCustomerId),
    ]);

    const payments = [...invoices, ...creditPurchases].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return NextResponse.json({ payments });
  } catch (error) {
    return handleStripeError(error, "Stripe Payments");
  }
}

interface PaymentItem {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  currency: string;
  status: string;
  receiptUrl: string | null;
  type: "subscription" | "credit_purchase";
}

async function fetchInvoices(customerId: string): Promise<PaymentItem[]> {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 100,
    });

    return invoices.data.map((inv) => ({
      id: inv.id,
      date: new Date((inv.created ?? 0) * 1000).toISOString(),
      description: inv.lines.data.map((l) => l.description).filter(Boolean).join(", ") || "Subscription payment",
      amountCents: inv.amount_paid ?? inv.total ?? 0,
      currency: inv.currency ?? "usd",
      status: inv.status ?? "unknown",
      receiptUrl: inv.hosted_invoice_url ?? null,
      type: "subscription" as const,
    }));
  } catch {
    return [];
  }
}

async function fetchCreditPurchases(customerId: string): Promise<PaymentItem[]> {
  try {
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 100,
    });

    const oneTimePayments = sessions.data.filter(
      (s) => s.mode === "payment" && s.payment_status === "paid"
    );

    const teamIds = oneTimePayments
      .filter((s) => s.metadata?.accountType === "team" && s.metadata?.accountId)
      .map((s) => s.metadata!.accountId!);

    const teamNameMap = new Map<string, string>();
    if (teamIds.length > 0) {
      const uniqueIds = Array.from(new Set(teamIds));
      const rows = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, uniqueIds));
      for (const row of rows) {
        teamNameMap.set(row.id, row.name);
      }
    }

    const items: PaymentItem[] = [];
    for (const session of oneTimePayments) {
      let receiptUrl: string | null = null;
      let amountCents = session.amount_total ?? 0;
      const currency = session.currency ?? "usd";
      let status = "paid";

      if (session.payment_intent) {
        try {
          const piId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent.id;
          const pi = await stripe.paymentIntents.retrieve(piId, {
            expand: ["latest_charge"],
          });
          const charge = pi.latest_charge;
          if (charge && typeof charge !== "string") {
            receiptUrl = charge.receipt_url ?? null;
            amountCents = charge.amount;
            if (charge.refunded) {
              status = "refunded";
            } else if (charge.amount_refunded > 0) {
              status = "partially_refunded";
            }
          }
        } catch { /* use session-level data as fallback */ }
      }

      const credits = session.metadata?.credits;
      const accountType = session.metadata?.accountType;
      const accountId = session.metadata?.accountId;

      let description: string;
      if (credits) {
        const target =
          accountType === "team" && accountId
            ? teamNameMap.get(accountId) ?? "Team"
            : accountType === "personal"
              ? "Personal"
              : undefined;
        description = target
          ? `Purchased ${credits} credits → ${target}`
          : `Purchased ${credits} credits`;
      } else {
        description = "Credit purchase";
      }

      items.push({
        id: session.id,
        date: new Date((session.created ?? 0) * 1000).toISOString(),
        description,
        amountCents,
        currency,
        status,
        receiptUrl,
        type: "credit_purchase",
      });
    }

    return items;
  } catch {
    return [];
  }
}
