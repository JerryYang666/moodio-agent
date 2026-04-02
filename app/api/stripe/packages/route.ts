import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscriptionPlans, creditPackages } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { handleStripeError } from "@/lib/stripe-errors";

/**
 * GET /api/stripe/packages
 * Public listing of active credit packages and the active subscription plan.
 * Query param `type` can be "credits", "subscription", or omitted for both.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const result: Record<string, any> = {};

    if (!type || type === "subscription") {
      const plans = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true));
      result.subscriptionPlans = plans;
    }

    if (!type || type === "credits") {
      const packages = await db
        .select()
        .from(creditPackages)
        .where(eq(creditPackages.isActive, true))
        .orderBy(asc(creditPackages.sortOrder));
      result.creditPackages = packages;
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleStripeError(error, "Stripe Packages");
  }
}
