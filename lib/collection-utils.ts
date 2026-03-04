import { db } from "@/lib/db";
import { collections, collectionImages, collectionShares, projectShares } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  PERMISSION_OWNER,
  hasWriteAccess,
  type PermissionOrNull,
  type SharePermission,
} from "@/lib/permissions";

export type CollectionPermission = PermissionOrNull;

/**
 * Check user's permission for a collection.
 * Priority: owner > direct collection share > inherited project share.
 */
export async function getUserPermission(
  collectionId: string,
  userId: string
): Promise<CollectionPermission> {
  // Fetch the collection (needed for both ownership check and project fallback)
  const [collection] = await db
    .select({ userId: collections.userId, projectId: collections.projectId })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);

  if (!collection) return null;

  if (collection.userId === userId) return PERMISSION_OWNER;

  // Check if collection is directly shared with user
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
    return share.permission as SharePermission;
  }

  // Fall back: check if the parent project is shared with user
  const [projectShare] = await db
    .select()
    .from(projectShares)
    .where(
      and(
        eq(projectShares.projectId, collection.projectId),
        eq(projectShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (projectShare) {
    return projectShare.permission as SharePermission;
  }

  return null;
}

/**
 * Check if user has write permission (owner or collaborator)
 */
export function hasWritePermission(permission: CollectionPermission): boolean {
  return hasWriteAccess(permission);
}

/**
 * Find an image in a collection by imageId
 * @deprecated Use findItemById instead for unique identification
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
 * Find an item by its unique record ID, optionally verifying it belongs to a specific collection
 */
export async function findItemById(
  itemId: string,
  collectionId?: string
) {
  const conditions = [eq(collectionImages.id, itemId)];
  if (collectionId) {
    conditions.push(eq(collectionImages.collectionId, collectionId));
  }

  const [item] = await db
    .select()
    .from(collectionImages)
    .where(and(...conditions))
    .limit(1);

  return item || null;
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
