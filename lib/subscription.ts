import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq, and, gt, inArray } from "drizzle-orm";

const ACTIVE_STATUSES = ["active", "trialing"] as const;

/**
 * Check whether a user has an active (or trialing) subscription whose
 * billing period has not yet ended.
 */
export async function hasActiveSubscription(
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        inArray(subscriptions.status, [...ACTIVE_STATUSES]),
        gt(subscriptions.currentPeriodEnd, new Date())
      )
    )
    .limit(1);

  return !!row;
}

/**
 * Return the full subscription record for a user, or null if none exists.
 */
export async function getUserSubscription(userId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  return row ?? null;
}
