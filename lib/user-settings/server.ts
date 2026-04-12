import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_USER_SETTINGS } from "./types";
import type { UserSettings } from "./types";

/**
 * Get all resolved settings for a user (DB values merged over defaults).
 */
export async function getUserSettings(
  userId: string
): Promise<Required<UserSettings>> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { settings: true },
  });

  if (!row) {
    return { ...DEFAULT_USER_SETTINGS };
  }

  return { ...DEFAULT_USER_SETTINGS, ...(row.settings as UserSettings) };
}

/**
 * Get a single setting value for a user.
 */
export async function getUserSetting<K extends keyof UserSettings>(
  userId: string,
  key: K
): Promise<Required<UserSettings>[K]> {
  const settings = await getUserSettings(userId);
  return settings[key];
}
