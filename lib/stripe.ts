import Stripe from "stripe";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sanitizeStatementDescriptorSuffix, buildFullStatementDescriptor } from "@/lib/statement-descriptor";

export { sanitizeStatementDescriptorSuffix, buildFullStatementDescriptor };

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
});

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
