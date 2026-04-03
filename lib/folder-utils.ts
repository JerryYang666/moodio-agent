import { db } from "@/lib/db";
import {
  folders,
  folderShares,
  collectionImages,
  collections,
} from "@/lib/db/schema";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import { getUserPermission } from "@/lib/collection-utils";
import {
  PERMISSION_OWNER,
  hasWriteAccess,
  type PermissionOrNull,
  type SharePermission,
} from "@/lib/permissions";

export type FolderPermission = PermissionOrNull;

const MAX_FOLDER_DEPTH = 20;

/**
 * Convert a UUID to an ltree-safe label (replace hyphens with underscores).
 */
export function uuidToLtreeLabel(id: string): string {
  return id.replace(/-/g, "_");
}

/**
 * Parse ancestor folder IDs from an ltree path string.
 * Path format: "label1.label2.label3" where each label is a UUID with underscores.
 * Returns the folder UUIDs (excluding the leaf which is the folder itself).
 */
function parseAncestorIdsFromPath(path: string): string[] {
  const labels = path.split(".");
  return labels.slice(0, -1).map((label) => label.replace(/_/g, "-"));
}

/**
 * Build the ltree path for a new folder given its parent.
 */
export function buildFolderPath(
  parentPath: string | null,
  folderId: string
): string {
  const label = uuidToLtreeLabel(folderId);
  return parentPath ? `${parentPath}.${label}` : label;
}

/**
 * Check user's permission for a folder.
 * Priority: owner > direct folder share > ancestor folder shares > collection share > project share.
 */
export async function getFolderPermission(
  folderId: string,
  userId: string
): Promise<FolderPermission> {
  const [folder] = await db
    .select({
      userId: folders.userId,
      collectionId: folders.collectionId,
      path: folders.path,
    })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);

  if (!folder) return null;

  if (folder.userId === userId) return PERMISSION_OWNER;

  // Check direct folder share
  const [directShare] = await db
    .select({ permission: folderShares.permission })
    .from(folderShares)
    .where(
      and(
        eq(folderShares.folderId, folderId),
        eq(folderShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (directShare) {
    return directShare.permission as SharePermission;
  }

  // Walk up ancestors via the materialized path
  const ancestorIds = parseAncestorIdsFromPath(folder.path);
  if (ancestorIds.length > 0) {
    const ancestorShares = await db
      .select({
        folderId: folderShares.folderId,
        permission: folderShares.permission,
      })
      .from(folderShares)
      .where(
        and(
          inArray(folderShares.folderId, ancestorIds),
          eq(folderShares.sharedWithUserId, userId)
        )
      );

    if (ancestorShares.length > 0) {
      // Find the closest ancestor share (deepest in the path)
      const ancestorOrder = new Map(
        ancestorIds.map((id, idx) => [id, idx])
      );
      ancestorShares.sort(
        (a, b) =>
          (ancestorOrder.get(b.folderId) ?? 0) -
          (ancestorOrder.get(a.folderId) ?? 0)
      );
      return ancestorShares[0].permission as SharePermission;
    }
  }

  // Fall back to collection permission (which itself falls back to project)
  return getUserPermission(folder.collectionId, userId);
}

/**
 * Check if user has write permission on a folder (owner or collaborator).
 */
export function hasFolderWritePermission(
  permission: FolderPermission
): boolean {
  return hasWriteAccess(permission);
}

/**
 * Get a folder by ID.
 */
export async function getFolder(folderId: string) {
  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);

  return folder || null;
}

/**
 * Get a folder with its parent collection's projectId.
 */
export async function getFolderWithProject(folderId: string) {
  const [result] = await db
    .select({
      folder: folders,
      projectId: collections.projectId,
    })
    .from(folders)
    .innerJoin(collections, eq(folders.collectionId, collections.id))
    .where(eq(folders.id, folderId))
    .limit(1);

  return result || null;
}

/**
 * Update folder's updatedAt timestamp.
 */
export async function touchFolder(folderId: string) {
  await db
    .update(folders)
    .set({ updatedAt: new Date() })
    .where(eq(folders.id, folderId));
}

/**
 * Validate that the new depth doesn't exceed the max limit.
 */
export function validateDepth(parentDepth: number): boolean {
  return parentDepth + 1 <= MAX_FOLDER_DEPTH;
}

/**
 * Get the breadcrumb chain for a folder (from collection root down to folder).
 * Returns: [{ id, name, type: 'collection' | 'folder' }, ...]
 */
export async function getFolderBreadcrumbs(folderId: string) {
  const folder = await getFolder(folderId);
  if (!folder) return null;

  const [collection] = await db
    .select({ id: collections.id, name: collections.name, projectId: collections.projectId })
    .from(collections)
    .where(eq(collections.id, folder.collectionId))
    .limit(1);

  if (!collection) return null;

  // Parse ancestor IDs from path and fetch their names
  const pathLabels = folder.path.split(".");
  const allFolderIds = pathLabels.map((label) =>
    label.replace(/_/g, "-")
  );

  const ancestorFolders =
    allFolderIds.length > 0
      ? await db
          .select({ id: folders.id, name: folders.name })
          .from(folders)
          .where(inArray(folders.id, allFolderIds))
      : [];

  const folderMap = new Map(
    ancestorFolders.map((f) => [f.id, f.name])
  );

  const crumbs: { id: string; name: string; type: "collection" | "folder" }[] =
    [{ id: collection.id, name: collection.name, type: "collection" }];

  for (const id of allFolderIds) {
    crumbs.push({
      id,
      name: folderMap.get(id) ?? "Unknown",
      type: "folder",
    });
  }

  return { projectId: collection.projectId, breadcrumbs: crumbs };
}

/**
 * Get immediate child folders of a parent (or top-level folders in a collection).
 */
export async function getChildFolders(
  collectionId: string,
  parentId: string | null
) {
  const condition = parentId
    ? and(
        eq(folders.collectionId, collectionId),
        eq(folders.parentId, parentId)
      )
    : and(
        eq(folders.collectionId, collectionId),
        isNull(folders.parentId)
      );

  return db
    .select()
    .from(folders)
    .where(condition)
    .orderBy(folders.sortOrder, folders.name);
}

/**
 * Get assets directly in a folder (not in sub-folders).
 */
export async function getFolderAssets(folderId: string) {
  return db
    .select()
    .from(collectionImages)
    .where(eq(collectionImages.folderId, folderId))
    .orderBy(desc(collectionImages.addedAt));
}
