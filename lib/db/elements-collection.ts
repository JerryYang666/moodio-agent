import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

const DEFAULT_ELEMENTS_COLLECTION_NAME = "My Elements";

/**
 * Returns (creating if needed) the user's default "My Elements" collection in
 * the given project. Used by the chat composer's "create element on the spot"
 * flow so library elements created without an explicit destination get a
 * single, predictable home rather than polluting "My Uploads".
 *
 * The lookup is by name within the project to keep this idempotent across the
 * existing schema (no `isDefault`/`kind` flag on collections today). If a user
 * manually renames "My Elements", a new one is created on next use — that's
 * acceptable for the on-the-spot creation path.
 */
export async function ensureDefaultElementsCollection(
  userId: string,
  projectId: string
) {
  const [existing] = await db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.userId, userId),
        eq(collections.projectId, projectId),
        eq(collections.name, DEFAULT_ELEMENTS_COLLECTION_NAME)
      )
    )
    .orderBy(asc(collections.createdAt))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(collections)
    .values({
      userId,
      projectId,
      name: DEFAULT_ELEMENTS_COLLECTION_NAME,
    })
    .returning();
  return created;
}
