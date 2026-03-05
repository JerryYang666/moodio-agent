/**
 * Central permission constants and types for the sharing system.
 *
 * All permission-level strings should be referenced from here
 * rather than hard-coded throughout the codebase.
 */

export const PERMISSION_VIEWER = "viewer" as const;
export const PERMISSION_COLLABORATOR = "collaborator" as const;
export const PERMISSION_OWNER = "owner" as const;

/** Permission levels that can be assigned when sharing (excludes "owner"). */
export const SHARE_PERMISSION_VALUES = [
  PERMISSION_VIEWER,
  PERMISSION_COLLABORATOR,
] as const;

/** A permission granted via a share record (viewer or collaborator). */
export type SharePermission = (typeof SHARE_PERMISSION_VALUES)[number];

/** Full permission level including ownership. */
export type Permission = typeof PERMISSION_OWNER | SharePermission;

/** Permission or null/undefined (user has no access). */
export type PermissionOrNull = Permission | null | undefined;

/** Check whether the given value is a valid share permission. */
export function isValidSharePermission(
  value: unknown
): value is SharePermission {
  return value === PERMISSION_VIEWER || value === PERMISSION_COLLABORATOR;
}

/** Check whether the permission grants write access (owner or collaborator). */
export function hasWriteAccess(permission: PermissionOrNull): boolean {
  return permission === PERMISSION_OWNER || permission === PERMISSION_COLLABORATOR;
}

/** Check whether the permission is owner-level. */
export function isOwner(permission: PermissionOrNull): boolean {
  return permission === PERMISSION_OWNER;
}
