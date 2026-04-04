import { db } from "@/lib/db";
import {
  productionTables,
  productionTableShares,
  productionTableColumnShares,
  productionTableRowShares,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  PERMISSION_OWNER,
  PERMISSION_COLLABORATOR,
  type PermissionOrNull,
  type SharePermission,
} from "@/lib/permissions";

/**
 * Resolve table-level permission for a user:
 *   owner > collaborator > viewer > null
 */
export async function getTablePermission(
  tableId: string,
  userId: string
): Promise<PermissionOrNull> {
  const [table] = await db
    .select({ id: productionTables.id })
    .from(productionTables)
    .where(
      and(eq(productionTables.id, tableId), eq(productionTables.userId, userId))
    )
    .limit(1);

  if (table) return PERMISSION_OWNER;

  const [share] = await db
    .select({ permission: productionTableShares.permission })
    .from(productionTableShares)
    .where(
      and(
        eq(productionTableShares.tableId, tableId),
        eq(productionTableShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (share) return share.permission as SharePermission;

  return null;
}

/**
 * Check whether a user can edit a specific cell at (columnId, rowId).
 *
 * Edit is allowed if any of the following hold:
 *  1. User is the table owner
 *  2. User has table-level collaborator share
 *  3. User has a column-level share for this column
 *  4. User has a row-level share for this row
 */
export async function canEditCell(
  tableId: string,
  columnId: string,
  rowId: string,
  userId: string
): Promise<boolean> {
  const tablePerm = await getTablePermission(tableId, userId);

  if (tablePerm === PERMISSION_OWNER || tablePerm === PERMISSION_COLLABORATOR) {
    return true;
  }

  const [colShare] = await db
    .select({ id: productionTableColumnShares.id })
    .from(productionTableColumnShares)
    .where(
      and(
        eq(productionTableColumnShares.tableId, tableId),
        eq(productionTableColumnShares.columnId, columnId),
        eq(productionTableColumnShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (colShare) return true;

  const [rowShare] = await db
    .select({ id: productionTableRowShares.id })
    .from(productionTableRowShares)
    .where(
      and(
        eq(productionTableRowShares.tableId, tableId),
        eq(productionTableRowShares.rowId, rowId),
        eq(productionTableRowShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  return !!rowShare;
}

/**
 * Batch-fetch the set of column IDs and row IDs a user has granular edit
 * access to. Used by the frontend to derive `canEditCell` without per-cell
 * API calls.
 */
export async function getEditableGrants(
  tableId: string,
  userId: string
): Promise<{ columnIds: string[]; rowIds: string[] }> {
  const colShares = await db
    .select({ columnId: productionTableColumnShares.columnId })
    .from(productionTableColumnShares)
    .where(
      and(
        eq(productionTableColumnShares.tableId, tableId),
        eq(productionTableColumnShares.sharedWithUserId, userId)
      )
    );

  const rowShares = await db
    .select({ rowId: productionTableRowShares.rowId })
    .from(productionTableRowShares)
    .where(
      and(
        eq(productionTableRowShares.tableId, tableId),
        eq(productionTableRowShares.sharedWithUserId, userId)
      )
    );

  return {
    columnIds: colShares.map((s) => s.columnId),
    rowIds: rowShares.map((s) => s.rowId),
  };
}
