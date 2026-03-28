import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { subscriptionPlans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/admin/subscription-plans
 * Returns all subscription plans (active and inactive).
 */
export async function GET(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const plans = await db.select().from(subscriptionPlans);
  return NextResponse.json(plans);
}

/**
 * POST /api/admin/subscription-plans
 * Create a new subscription plan.
 */
export async function POST(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, description, stripePriceId, priceCents, interval } = body;

    if (!name || !stripePriceId || priceCents == null) {
      return NextResponse.json(
        { error: "name, stripePriceId, and priceCents are required" },
        { status: 400 }
      );
    }

    const [plan] = await db
      .insert(subscriptionPlans)
      .values({
        name,
        description: description || null,
        stripePriceId,
        priceCents: Number(priceCents),
        interval: interval || "month",
      })
      .returning();

    return NextResponse.json(plan, { status: 201 });
  } catch (error: any) {
    console.error("[Admin Subscription Plans] Create error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create plan" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/subscription-plans
 * Update an existing subscription plan.
 */
export async function PUT(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const allowedFields: Record<string, string> = {
      name: "name",
      description: "description",
      stripePriceId: "stripePriceId",
      priceCents: "priceCents",
      interval: "interval",
      isActive: "isActive",
    };

    const setValues: Record<string, any> = { updatedAt: new Date() };
    for (const [key, col] of Object.entries(allowedFields)) {
      if (updates[key] !== undefined) {
        setValues[col] = updates[key];
      }
    }

    const [plan] = await db
      .update(subscriptionPlans)
      .set(setValues)
      .where(eq(subscriptionPlans.id, id))
      .returning();

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (error: any) {
    console.error("[Admin Subscription Plans] Update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update plan" },
      { status: 500 }
    );
  }
}
