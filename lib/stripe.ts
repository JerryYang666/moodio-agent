import Stripe from "stripe";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
});

const STATEMENT_DESCRIPTOR_PREFIX = "MOODIO";
const SEPARATOR_LENGTH = 2; // "* " between prefix and suffix
const MAX_TOTAL_LENGTH = 22;
const MAX_SUFFIX_LENGTH =
  MAX_TOTAL_LENGTH - STATEMENT_DESCRIPTOR_PREFIX.length - SEPARATOR_LENGTH;

/**
 * Sanitize a product name into a valid Stripe statement descriptor suffix.
 *
 * Rules enforced:
 * - Latin characters only (strips everything else)
 * - No forbidden chars: < > \ ' " *
 * - At least one letter
 * - Trimmed to fit within 22-char total (prefix + "* " + suffix)
 */
export function sanitizeStatementDescriptorSuffix(name: string): string {
  const cleaned = name
    .replace(/\bmoodio\b/gi, "")
    .replace(/[<>\\'""*＊]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const truncated = cleaned.slice(0, MAX_SUFFIX_LENGTH).trim();

  if (truncated.length === 0 || !/[a-zA-Z]/.test(truncated)) {
    return "Purchase";
  }

  return truncated;
}

/**
 * Look up the Stripe Customer ID for a user, creating one if it doesn't exist.
 * Persists the mapping back to the users table so subsequent calls are free.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!existing.deleted) {
        return user.stripeCustomerId;
      }
    } catch (err: any) {
      if (err?.code !== "resource_missing") throw err;
    }
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await db
    .update(users)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return customer.id;
}
