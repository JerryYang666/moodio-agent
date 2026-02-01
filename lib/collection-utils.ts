import { db } from "@/lib/db";
import { collections, collectionImages, collectionShares } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export type CollectionPermission = "owner" | "collaborator" | "viewer" | null;

/**
 * Check user's permission for a collection
 */
export async function getUserPermission(
  collectionId: string,
  userId: string
): Promise<CollectionPermission> {
  // Check if user owns the collection
  const [collection] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);

  if (collection) {
    return "owner";
  }

  // Check if collection is shared with user
  const [share] = await db
    .select()
    .from(collectionShares)
    .where(
      and(
        eq(collectionShares.collectionId, collectionId),
        eq(collectionShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (share) {
    return share.permission as "collaborator" | "viewer";
  }

  return null;
}

/**
 * Check if user has write permission (owner or collaborator)
 */
export function hasWritePermission(permission: CollectionPermission): boolean {
  return permission === "owner" || permission === "collaborator";
}

/**
 * Find an image in a collection by imageId
 */
export async function findImageInCollection(
  collectionId: string,
  imageId: string
) {
  const [image] = await db
    .select()
    .from(collectionImages)
    .where(
      and(
        eq(collectionImages.collectionId, collectionId),
        eq(collectionImages.imageId, imageId)
      )
    )
    .limit(1);

  return image || null;
}

/**
 * Get collection by ID
 */
export async function getCollection(collectionId: string) {
  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);

  return collection || null;
}

/**
 * Update collection's updatedAt timestamp
 */
export async function touchCollection(collectionId: string) {
  await db
    .update(collections)
    .set({ updatedAt: new Date() })
    .where(eq(collections.id, collectionId));
}
