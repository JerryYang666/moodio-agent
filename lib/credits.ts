import { db } from "@/lib/db";
import { userCredits, creditTransactions } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";

// Helper type to support both db and transaction objects
type DbOrTx = typeof db | any;

export class InsufficientCreditsError extends Error {
  constructor(message = "INSUFFICIENT_CREDITS") {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Related entity reference for linking transactions to other records
 */
export interface RelatedEntity {
  type: string; // e.g., 'video_generation'
  id: string; // UUID of the related entity
}

/**
 * Get user credit balance.
 * Creates the userCredits record if it doesn't exist.
 */
export async function getUserBalance(
  userId: string,
  tx: DbOrTx = db
): Promise<number> {
  const [record] = await tx
    .select()
    .from(userCredits)
    .where(eq(userCredits.userId, userId));

  if (!record) {
    // Create record if not exists
    const [newRecord] = await tx
      .insert(userCredits)
      .values({ userId, balance: 0 })
      .returning();
    return newRecord.balance;
  }

  return record.balance;
}

/**
 * Deduct credits from a user.
 * Throws InsufficientCreditsError if balance is too low.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: string,
  description?: string,
  relatedEntity?: RelatedEntity,
  tx: DbOrTx = db
): Promise<void> {
  // Ensure amount is positive
  const deduction = Math.abs(amount);
  if (deduction === 0) return;

  const operation = async (executor: DbOrTx) => {
    // 1. Get current balance
    const [record] = await executor
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, userId));

    const balance = record?.balance || 0;

    if (balance < deduction) {
      throw new InsufficientCreditsError();
    }

    // 2. Deduct
    await executor
      .update(userCredits)
      .set({
        balance: sql`${userCredits.balance} - ${deduction}`,
        updatedAt: new Date(),
      })
      .where(eq(userCredits.userId, userId));

    // 3. Log transaction
    await executor.insert(creditTransactions).values({
      userId,
      amount: -deduction,
      type,
      description,
      relatedEntityType: relatedEntity?.type,
      relatedEntityId: relatedEntity?.id,
    });
  };

  if (tx === db) {
    await db.transaction(operation);
  } else {
    await operation(tx);
  }
}

/**
 * Grant (add) credits to a user.
 */
export async function grantCredits(
  userId: string,
  amount: number,
  type: string,
  description?: string,
  performedBy?: string,
  relatedEntity?: RelatedEntity,
  tx: DbOrTx = db
): Promise<void> {
  const grantAmount = Math.abs(amount);
  if (grantAmount === 0) return;

  const operation = async (executor: DbOrTx) => {
    // 1. Ensure record exists or update
    const [record] = await executor
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, userId));

    if (!record) {
      await executor.insert(userCredits).values({
        userId,
        balance: grantAmount,
      });
    } else {
      await executor
        .update(userCredits)
        .set({
          balance: sql`${userCredits.balance} + ${grantAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(userCredits.userId, userId));
    }

    // 2. Log transaction
    await executor.insert(creditTransactions).values({
      userId,
      amount: grantAmount,
      type,
      description,
      performedBy,
      relatedEntityType: relatedEntity?.type,
      relatedEntityId: relatedEntity?.id,
    });
  };

  if (tx === db) {
    await db.transaction(operation);
  } else {
    await operation(tx);
  }
}

/**
 * Get the original charge transaction for a related entity.
 * Used to look up how much was charged for refunds.
 */
export async function getChargeForEntity(
  relatedEntity: RelatedEntity,
  tx: DbOrTx = db
): Promise<{ amount: number; userId: string } | null> {
  const [transaction] = await tx
    .select()
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.relatedEntityType, relatedEntity.type),
        eq(creditTransactions.relatedEntityId, relatedEntity.id),
        // Charges are negative amounts
        sql`${creditTransactions.amount} < 0`
      )
    )
    .limit(1);

  if (!transaction) return null;

  return {
    // Return absolute value (charges are stored as negative)
    amount: Math.abs(transaction.amount),
    userId: transaction.userId,
  };
}

/**
 * Refund a previous charge by looking up the original transaction.
 * Returns the refunded amount, or null if no charge was found.
 */
export async function refundCharge(
  relatedEntity: RelatedEntity,
  reason: string,
  tx: DbOrTx = db
): Promise<number | null> {
  const operation = async (executor: DbOrTx) => {
    // 1. Look up original charge
    const charge = await getChargeForEntity(relatedEntity, executor);
    if (!charge) {
      console.error(`[Refund] No charge found for ${relatedEntity.type}:${relatedEntity.id}`);
      return null;
    }

    // 2. Grant the refund
    await grantCredits(
      charge.userId,
      charge.amount,
      "refund",
      reason,
      undefined, // performedBy (system)
      relatedEntity,
      executor
    );

    return charge.amount;
  };

  if (tx === db) {
    return await db.transaction(operation);
  } else {
    return await operation(tx);
  }
}
