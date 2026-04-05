import { db } from "@/lib/db";
import {
  productionTables,
  productionTableColumns,
  productionTableRows,
  productionTableCells,
  productionTableShares,
  productionTableColumnShares,
  productionTableRowShares,
  users,
} from "@/lib/db/schema";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { PERMISSION_OWNER } from "@/lib/permissions";
import type {
  EnrichedProductionTable,
  EnrichedCell,
  MediaAssetRef,
  EnrichedMediaAssetRef,
  CellType,
} from "./types";
import { getTablePermission, getEditableGrants } from "./permissions";
import { getImageUrl } from "@/lib/storage/s3";

// ---------------------------------------------------------------------------
// Table CRUD
// ---------------------------------------------------------------------------

export async function listTablesForUser(userId: string) {
  const owned = await db
    .select()
    .from(productionTables)
    .where(eq(productionTables.userId, userId))
    .orderBy(desc(productionTables.updatedAt));

  const shared = await db
    .select({
      table: productionTables,
      permission: productionTableShares.permission,
      sharedAt: productionTableShares.sharedAt,
    })
    .from(productionTableShares)
    .innerJoin(
      productionTables,
      eq(productionTableShares.tableId, productionTables.id)
    )
    .where(eq(productionTableShares.sharedWithUserId, userId))
    .orderBy(desc(productionTableShares.sharedAt));

  return {
    owned: owned.map((t) => ({
      ...t,
      permission: PERMISSION_OWNER,
      isOwner: true,
    })),
    shared: shared.map((s) => ({
      ...s.table,
      permission: s.permission,
      isOwner: false,
      sharedAt: s.sharedAt,
    })),
  };
}

export async function createTable(
  userId: string,
  name: string,
  teamId?: string
) {
  const [table] = await db
    .insert(productionTables)
    .values({ userId, name, teamId: teamId ?? null })
    .returning();
  return table;
}

export async function getTableById(tableId: string) {
  const [table] = await db
    .select()
    .from(productionTables)
    .where(eq(productionTables.id, tableId))
    .limit(1);
  return table ?? null;
}

export async function renameTable(tableId: string, name: string) {
  const [table] = await db
    .update(productionTables)
    .set({ name, updatedAt: new Date() })
    .where(eq(productionTables.id, tableId))
    .returning();
  return table;
}

export async function deleteTable(tableId: string) {
  await db
    .delete(productionTables)
    .where(eq(productionTables.id, tableId));
}

/**
 * Fetch a fully enriched table (columns, rows, sparse cells, permission info)
 * for a specific user. Returns null if the table doesn't exist or user has no access.
 */
export async function getEnrichedTable(
  tableId: string,
  userId: string
): Promise<EnrichedProductionTable | null> {
  const table = await getTableById(tableId);
  if (!table) return null;

  const permission = await getTablePermission(tableId, userId);
  if (!permission) return null;

  const [columns, rows, cells, shares] = await Promise.all([
    db
      .select()
      .from(productionTableColumns)
      .where(eq(productionTableColumns.tableId, tableId))
      .orderBy(asc(productionTableColumns.sortOrder)),
    db
      .select()
      .from(productionTableRows)
      .where(eq(productionTableRows.tableId, tableId))
      .orderBy(asc(productionTableRows.sortOrder)),
    db
      .select()
      .from(productionTableCells)
      .where(eq(productionTableCells.tableId, tableId)),
    db
      .select()
      .from(productionTableShares)
      .where(eq(productionTableShares.tableId, tableId)),
  ]);

  const cellMap: Record<string, EnrichedCell> = {};
  for (const c of cells) {
    const key = `${c.columnId}:${c.rowId}`;
    cellMap[key] = {
      id: c.id,
      tableId: c.tableId,
      columnId: c.columnId,
      rowId: c.rowId,
      textContent: c.textContent,
      mediaAssets: enrichMediaAssets(c.mediaAssets as MediaAssetRef[] | null),
      updatedAt: c.updatedAt,
      updatedBy: c.updatedBy,
    };
  }

  return {
    ...table,
    columns,
    rows,
    cellMap,
    permission,
    shares,
  };
}

// ---------------------------------------------------------------------------
// Column CRUD
// ---------------------------------------------------------------------------

export async function addColumn(
  tableId: string,
  name: string,
  cellType: CellType
) {
  const existing = await db
    .select({ sortOrder: productionTableColumns.sortOrder })
    .from(productionTableColumns)
    .where(eq(productionTableColumns.tableId, tableId))
    .orderBy(desc(productionTableColumns.sortOrder))
    .limit(1);

  const nextOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

  const [column] = await db
    .insert(productionTableColumns)
    .values({ tableId, name, cellType, sortOrder: nextOrder })
    .returning();

  await touchTable(tableId);
  return column;
}

export async function renameColumn(columnId: string, name: string) {
  const [column] = await db
    .update(productionTableColumns)
    .set({ name })
    .where(eq(productionTableColumns.id, columnId))
    .returning();
  return column;
}

export async function deleteColumn(columnId: string, tableId: string) {
  await db
    .delete(productionTableColumns)
    .where(eq(productionTableColumns.id, columnId));
  await touchTable(tableId);
}

export async function reorderColumns(tableId: string, columnIds: string[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < columnIds.length; i++) {
      await tx
        .update(productionTableColumns)
        .set({ sortOrder: i })
        .where(
          and(
            eq(productionTableColumns.id, columnIds[i]),
            eq(productionTableColumns.tableId, tableId)
          )
        );
    }
  });
  await touchTable(tableId);
}

// ---------------------------------------------------------------------------
// Row CRUD
// ---------------------------------------------------------------------------

export async function addRow(tableId: string) {
  const existing = await db
    .select({ sortOrder: productionTableRows.sortOrder })
    .from(productionTableRows)
    .where(eq(productionTableRows.tableId, tableId))
    .orderBy(desc(productionTableRows.sortOrder))
    .limit(1);

  const nextOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

  const [row] = await db
    .insert(productionTableRows)
    .values({ tableId, sortOrder: nextOrder })
    .returning();

  await touchTable(tableId);
  return row;
}

export async function deleteRow(rowId: string, tableId: string) {
  await db
    .delete(productionTableRows)
    .where(eq(productionTableRows.id, rowId));
  await touchTable(tableId);
}

export async function reorderRows(tableId: string, rowIds: string[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < rowIds.length; i++) {
      await tx
        .update(productionTableRows)
        .set({ sortOrder: i })
        .where(
          and(
            eq(productionTableRows.id, rowIds[i]),
            eq(productionTableRows.tableId, tableId)
          )
        );
    }
  });
  await touchTable(tableId);
}

// ---------------------------------------------------------------------------
// Cell upsert (sparse)
// ---------------------------------------------------------------------------

export async function upsertCell(
  tableId: string,
  columnId: string,
  rowId: string,
  textContent: string | null | undefined,
  mediaAssets: MediaAssetRef[] | null | undefined,
  updatedBy: string
) {
  const cleanAssets = stripMediaUrls(mediaAssets ?? null);

  const [cell] = await db
    .insert(productionTableCells)
    .values({
      tableId,
      columnId,
      rowId,
      textContent: textContent ?? null,
      mediaAssets: cleanAssets,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [productionTableCells.columnId, productionTableCells.rowId],
      set: {
        textContent: textContent ?? null,
        mediaAssets: cleanAssets,
        updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();

  await touchTable(tableId);
  return cell;
}

// ---------------------------------------------------------------------------
// Sharing helpers
// ---------------------------------------------------------------------------

export async function listShares(tableId: string) {
  const [tableShares, colShares, rowShares] = await Promise.all([
    db
      .select({
        id: productionTableShares.id,
        tableId: productionTableShares.tableId,
        sharedWithUserId: productionTableShares.sharedWithUserId,
        permission: productionTableShares.permission,
        sharedAt: productionTableShares.sharedAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(productionTableShares)
      .innerJoin(users, eq(productionTableShares.sharedWithUserId, users.id))
      .where(eq(productionTableShares.tableId, tableId)),
    db
      .select({
        id: productionTableColumnShares.id,
        tableId: productionTableColumnShares.tableId,
        columnId: productionTableColumnShares.columnId,
        sharedWithUserId: productionTableColumnShares.sharedWithUserId,
        sharedAt: productionTableColumnShares.sharedAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(productionTableColumnShares)
      .innerJoin(users, eq(productionTableColumnShares.sharedWithUserId, users.id))
      .where(eq(productionTableColumnShares.tableId, tableId)),
    db
      .select({
        id: productionTableRowShares.id,
        tableId: productionTableRowShares.tableId,
        rowId: productionTableRowShares.rowId,
        sharedWithUserId: productionTableRowShares.sharedWithUserId,
        sharedAt: productionTableRowShares.sharedAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(productionTableRowShares)
      .innerJoin(users, eq(productionTableRowShares.sharedWithUserId, users.id))
      .where(eq(productionTableRowShares.tableId, tableId)),
  ]);
  return { tableShares, columnShares: colShares, rowShares };
}

export async function addTableShare(
  tableId: string,
  sharedWithUserId: string,
  permission: string
) {
  const [share] = await db
    .insert(productionTableShares)
    .values({ tableId, sharedWithUserId, permission })
    .returning();
  return share;
}

export async function removeTableShare(tableId: string, userId: string) {
  await db
    .delete(productionTableShares)
    .where(
      and(
        eq(productionTableShares.tableId, tableId),
        eq(productionTableShares.sharedWithUserId, userId)
      )
    );
}

export async function addColumnShares(
  tableId: string,
  columnIds: string[],
  sharedWithUserId: string
) {
  const values = columnIds.map((columnId) => ({
    tableId,
    columnId,
    sharedWithUserId,
  }));
  await db
    .insert(productionTableColumnShares)
    .values(values)
    .onConflictDoNothing();
}

export async function removeColumnShare(columnId: string, userId: string) {
  await db
    .delete(productionTableColumnShares)
    .where(
      and(
        eq(productionTableColumnShares.columnId, columnId),
        eq(productionTableColumnShares.sharedWithUserId, userId)
      )
    );
}

export async function addRowShares(
  tableId: string,
  rowIds: string[],
  sharedWithUserId: string
) {
  const values = rowIds.map((rowId) => ({
    tableId,
    rowId,
    sharedWithUserId,
  }));
  await db
    .insert(productionTableRowShares)
    .values(values)
    .onConflictDoNothing();
}

export async function removeRowShare(rowId: string, userId: string) {
  await db
    .delete(productionTableRowShares)
    .where(
      and(
        eq(productionTableRowShares.rowId, rowId),
        eq(productionTableRowShares.sharedWithUserId, userId)
      )
    );
}

export { getEditableGrants };

// ---------------------------------------------------------------------------
// Media asset URL strip / enrich helpers
// ---------------------------------------------------------------------------

function stripMediaUrls(
  assets: MediaAssetRef[] | null
): MediaAssetRef[] | null {
  if (!assets) return null;
  return assets.map(({ assetId, imageId, assetType, thumbnailImageId }) => ({
    assetId,
    imageId,
    assetType,
    ...(thumbnailImageId ? { thumbnailImageId } : {}),
  }));
}

function enrichMediaAssets(
  assets: MediaAssetRef[] | null
): EnrichedMediaAssetRef[] | null {
  if (!assets) return null;
  return assets.map((a) => ({
    ...a,
    imageUrl: a.imageId ? getImageUrl(a.imageId) : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function touchTable(tableId: string) {
  await db
    .update(productionTables)
    .set({ updatedAt: new Date() })
    .where(eq(productionTables.id, tableId));
}
