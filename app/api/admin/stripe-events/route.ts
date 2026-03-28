import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { stripeEvents, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/admin/stripe-events
 * Returns all Stripe webhook events for audit, ordered newest first.
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

  const events = await db
    .select({
      id: stripeEvents.id,
      stripeEventId: stripeEvents.stripeEventId,
      eventType: stripeEvents.eventType,
      userId: stripeEvents.userId,
      userEmail: users.email,
      stripeCustomerId: stripeEvents.stripeCustomerId,
      metadata: stripeEvents.metadata,
      createdAt: stripeEvents.createdAt,
    })
    .from(stripeEvents)
    .leftJoin(users, eq(stripeEvents.userId, users.id))
    .orderBy(desc(stripeEvents.createdAt))
    .limit(500);

  return NextResponse.json(events);
}
