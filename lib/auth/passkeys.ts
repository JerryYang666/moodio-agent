import { db } from "@/lib/db";
import { authChallenges, passkeys, type NewPasskey } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { siteConfig } from "@/config/site";

export const rpName = siteConfig.name;

/**
 * Save a WebAuthn challenge to the database
 */
export async function saveAuthChallenge(challenge: string, userId?: string) {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minutes expiration

  await db.insert(authChallenges).values({
    challenge,
    expiresAt,
    userId: userId || null,
  });
}

/**
 * Retrieve a valid challenge from the database
 */
export async function getAuthChallenge(challenge: string) {
  const [record] = await db
    .select()
    .from(authChallenges)
    .where(and(
      eq(authChallenges.challenge, challenge),
      gt(authChallenges.expiresAt, new Date())
    ))
    .limit(1);
    
  return record;
}

/**
 * Delete a used challenge
 */
export async function deleteAuthChallenge(challenge: string) {
  await db.delete(authChallenges).where(eq(authChallenges.challenge, challenge));
}

/**
 * Get all passkeys for a user
 */
export async function getUserPasskeys(userId: string) {
  return db.select().from(passkeys).where(eq(passkeys.userId, userId));
}

/**
 * Get a specific passkey by credential ID
 */
export async function getPasskeyByCredentialId(credentialId: string) {
  const [record] = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, credentialId))
    .limit(1);
  return record;
}

/**
 * Save a new passkey
 */
export async function savePasskey(passkey: NewPasskey) {
  await db.insert(passkeys).values(passkey);
}

/**
 * Update passkey counter and usage time
 */
export async function updatePasskeyCounter(id: string, counter: number | bigint) {
   await db.update(passkeys)
     .set({ 
       counter: typeof counter === 'bigint' ? Number(counter) : counter, 
       lastUsedAt: new Date() 
     })
     .where(eq(passkeys.id, id));
}

