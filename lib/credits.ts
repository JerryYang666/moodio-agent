import { db } from "@/lib/db";
import {
  userCredits,
  teamCredits,
  creditTransactions,
  userActiveAccounts,
} from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import type { AccessTokenPayload } from "@/lib/auth/jwt";

type DbOrTx = typeof db | any;

export type AccountType = "personal" | "team";

export interface ActiveAccount {
  accountId: string;
  accountType: AccountType;
  performedBy: string;
}

export class InsufficientCreditsError extends Error {
  constructor(message = "INSUFFICIENT_CREDITS") {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

export interface RelatedEntity {
  type: string;
  id: string;
}

/**
 * Read the user's active billing account from the DB and validate membership.
 * Falls back to the user's personal account when no preference is stored
 * or when team membership can no longer be confirmed via the JWT.
 */
export async function getActiveAccount(
  userId: string,
  payload: AccessTokenPayload
): Promise<ActiveAccount> {
  const personal: ActiveAccount = {
    accountId: userId,
    accountType: "personal",
    performedBy: userId,
  };

  const [row] = await db
    .select()
    .from(userActiveAccounts)
    .where(eq(userActiveAccounts.userId, userId));

  if (!row || row.accountType !== "team" || !row.accountId) {
    return personal;
  }

  const membership = payload.teams?.find((t) => t.id === row.accountId);
  if (!membership) {
    return personal;
  }

  return {
    accountId: row.accountId,
    accountType: "team",
    performedBy: userId,
  };
}

function getBalanceTable(accountType: AccountType) {
  return accountType === "team" ? teamCredits : userCredits;
}

function getIdColumn(accountType: AccountType) {
  return accountType === "team" ? teamCredits.teamId : userCredits.userId;
}

/**
 * Get credit balance for a personal or team account.
 * Auto-creates the record if it doesn't exist (personal only; team records are created with the team).
 */
export async function getUserBalance(
  accountId: string,
  accountType: AccountType,
  tx: DbOrTx = db
): Promise<number> {
  const table = getBalanceTable(accountType);
  const idCol = getIdColumn(accountType);

  const [record] = await tx
    .select()
    .from(table)
    .where(eq(idCol, accountId));

  if (!record) {
    if (accountType === "personal") {
      const [newRecord] = await tx
        .insert(userCredits)
        .values({ userId: accountId, balance: 0 })
        .returning();
      return newRecord.balance;
    }
    return 0;
  }

  return record.balance;
}

/**
 * Verify an account has enough credits.
 */
export async function assertSufficientCredits(
  accountId: string,
  amount: number,
  accountType: AccountType,
  tx: DbOrTx = db
): Promise<void> {
  const balance = await getUserBalance(accountId, accountType, tx);
  if (balance < Math.abs(amount)) {
    throw new InsufficientCreditsError();
  }
}

/**
 * Deduct credits from a personal or team account.
 */
export async function deductCredits(
  accountId: string,
  amount: number,
  type: string,
  description: string | undefined,
  performedBy: string | undefined,
  relatedEntity: RelatedEntity | undefined,
  accountType: AccountType,
  tx: DbOrTx = db
): Promise<void> {
  const deduction = Math.abs(amount);
  if (deduction === 0) return;

  const table = getBalanceTable(accountType);
  const idCol = getIdColumn(accountType);

  const operation = async (executor: DbOrTx) => {
    const [record] = await executor
      .select()
      .from(table)
      .where(eq(idCol, accountId));

    const balance = record?.balance || 0;

    if (balance < deduction) {
      throw new InsufficientCreditsError();
    }

    await executor
      .update(table)
      .set({
        balance: sql`${table.balance} - ${deduction}`,
        updatedAt: new Date(),
      })
      .where(eq(idCol, accountId));

    await executor.insert(creditTransactions).values({
      accountId,
      accountType,
      amount: -deduction,
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
 * Grant (add) credits to a personal or team account.
 */
export async function grantCredits(
  accountId: string,
  amount: number,
  type: string,
  description: string | undefined,
  performedBy: string | undefined,
  relatedEntity: RelatedEntity | undefined,
  accountType: AccountType,
  tx: DbOrTx = db
): Promise<void> {
  const grantAmount = Math.abs(amount);
  if (grantAmount === 0) return;

  const table = getBalanceTable(accountType);
  const idCol = getIdColumn(accountType);

  const operation = async (executor: DbOrTx) => {
    const [record] = await executor
      .select()
      .from(table)
      .where(eq(idCol, accountId));

    if (!record) {
      if (accountType === "personal") {
        await executor.insert(userCredits).values({
          userId: accountId,
          balance: grantAmount,
        });
      } else {
        await executor.insert(teamCredits).values({
          teamId: accountId,
          balance: grantAmount,
        });
      }
    } else {
      await executor
        .update(table)
        .set({
          balance: sql`${table.balance} + ${grantAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(idCol, accountId));
    }

    await executor.insert(creditTransactions).values({
      accountId,
      accountType,
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
 */
export async function getChargeForEntity(
  relatedEntity: RelatedEntity,
  tx: DbOrTx = db
): Promise<{
  amount: number;
  accountId: string;
  accountType: AccountType;
} | null> {
  const [transaction] = await tx
    .select()
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.relatedEntityType, relatedEntity.type),
        eq(creditTransactions.relatedEntityId, relatedEntity.id),
        sql`${creditTransactions.amount} < 0`
      )
    )
    .limit(1);

  if (!transaction) return null;

  return {
    amount: Math.abs(transaction.amount),
    accountId: transaction.accountId,
    accountType: transaction.accountType as AccountType,
  };
}

/**
 * Refund a previous charge by looking up the original transaction.
 */
export async function refundCharge(
  relatedEntity: RelatedEntity,
  reason: string,
  tx: DbOrTx = db
): Promise<number | null> {
  const operation = async (executor: DbOrTx) => {
    const charge = await getChargeForEntity(relatedEntity, executor);
    if (!charge) {
      console.error(
        `[Refund] No charge found for ${relatedEntity.type}:${relatedEntity.id}`
      );
      return null;
    }

    await grantCredits(
      charge.accountId,
      charge.amount,
      "refund",
      reason,
      undefined,
      relatedEntity,
      charge.accountType,
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
