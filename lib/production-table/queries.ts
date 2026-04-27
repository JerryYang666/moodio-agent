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
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { PERMISSION_OWNER } from "@/lib/permissions";
import type {
  EnrichedProductionTable,
  EnrichedCell,
  MediaAssetRef,
  EnrichedMediaAssetRef,
  CellType,
  CellComment,
} from "./types";
import { getTablePermission, getEditableGrants } from "./permissions";
import { getImageUrl, getVideoUrl, getAudioUrl } from "@/lib/storage/s3";
import { getContentUrl } from "@/lib/config/video.config";
import { getUserSetting } from "@/lib/user-settings/server";

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

  const cnMode = await getUserSetting(userId, "cnMode");

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
      mediaAssets: enrichMediaAssets(c.mediaAssets as MediaAssetRef[] | null, cnMode),
      comment: (c.comment as CellComment | null) ?? null,
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

/**
 * Insert a new column. An explicit `id` may be supplied to restore a
 * previously-deleted column (used by undo). Collisions raise the same
 * unique-key error the insert already does.
 */
export async function addColumn(
  tableId: string,
  name: string,
  cellType: CellType,
  options?: { id?: string; width?: number; sortOrder?: number }
) {
  let sortOrder: number;
  if (typeof options?.sortOrder === "number") {
    sortOrder = options.sortOrder;
  } else {
    const existing = await db
      .select({ sortOrder: productionTableColumns.sortOrder })
      .from(productionTableColumns)
      .where(eq(productionTableColumns.tableId, tableId))
      .orderBy(desc(productionTableColumns.sortOrder))
      .limit(1);
    sortOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;
  }

  const values: Record<string, unknown> = { tableId, name, cellType, sortOrder };
  if (options?.id) values.id = options.id;
  if (typeof options?.width === "number") values.width = options.width;

  const [column] = await db
    .insert(productionTableColumns)
    .values(values as typeof productionTableColumns.$inferInsert)
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

export async function resizeColumn(columnId: string, width: number) {
  const clamped = Math.max(80, Math.min(800, Math.round(width)));
  const [column] = await db
    .update(productionTableColumns)
    .set({ width: clamped })
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

export async function countTableColumns(tableId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productionTableColumns)
    .where(eq(productionTableColumns.tableId, tableId));
  return result?.count ?? 0;
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

/**
 * Insert a new row. An explicit `id` may be supplied to restore a
 * previously-deleted row (used by undo).
 */
export async function addRow(
  tableId: string,
  options?: { id?: string; height?: number; sortOrder?: number }
) {
  let sortOrder: number;
  if (typeof options?.sortOrder === "number") {
    sortOrder = options.sortOrder;
  } else {
    const existing = await db
      .select({ sortOrder: productionTableRows.sortOrder })
      .from(productionTableRows)
      .where(eq(productionTableRows.tableId, tableId))
      .orderBy(desc(productionTableRows.sortOrder))
      .limit(1);
    sortOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;
  }

  const values: Record<string, unknown> = { tableId, sortOrder };
  if (options?.id) values.id = options.id;
  if (typeof options?.height === "number") values.height = options.height;

  const [row] = await db
    .insert(productionTableRows)
    .values(values as typeof productionTableRows.$inferInsert)
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

export async function countTableRows(tableId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productionTableRows)
    .where(eq(productionTableRows.tableId, tableId));
  return result?.count ?? 0;
}

export async function resizeRow(rowId: string, height: number) {
  const clamped = Math.max(32, Math.min(400, Math.round(height)));
  const [row] = await db
    .update(productionTableRows)
    .set({ height: clamped })
    .where(eq(productionTableRows.id, rowId))
    .returning();
  return row;
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
// Bulk-insert helpers (used by the table creation wizard)
// ---------------------------------------------------------------------------

export async function bulkAddColumns(
  tableId: string,
  columns: Array<{ name: string; cellType: CellType }>
) {
  if (columns.length === 0) return [];
  const values = columns.map((col, i) => ({
    tableId,
    name: col.name,
    cellType: col.cellType,
    sortOrder: i,
  }));
  const inserted = await db
    .insert(productionTableColumns)
    .values(values)
    .returning();
  await touchTable(tableId);
  return inserted;
}

export async function bulkAddRows(tableId: string, count: number) {
  if (count <= 0) return [];
  const values = Array.from({ length: count }, (_, i) => ({
    tableId,
    sortOrder: i,
  }));
  const inserted = await db
    .insert(productionTableRows)
    .values(values)
    .returning();
  await touchTable(tableId);
  return inserted;
}

export async function bulkInsertCells(
  tableId: string,
  cells: Array<{ columnId: string; rowId: string; textContent: string }>,
  updatedBy: string
) {
  if (cells.length === 0) return;
  const now = new Date();
  const values = cells.map((c) => ({
    tableId,
    columnId: c.columnId,
    rowId: c.rowId,
    textContent: c.textContent,
    mediaAssets: null,
    updatedBy,
    updatedAt: now,
  }));
  await db.insert(productionTableCells).values(values);
  await touchTable(tableId);
}

/**
 * Re-insert a batch of cells verbatim. Used by undo when restoring a deleted
 * row or column — each cell's original textContent / mediaAssets / comment
 * is preserved so the user sees the state they had before the delete.
 *
 * This is atomic when called inside a transaction; callers that need
 * atomicity with a row/column insert should wrap both in `db.transaction`.
 */
export async function bulkRestoreCells(
  tableId: string,
  cells: Array<{
    columnId: string;
    rowId: string;
    textContent: string | null;
    mediaAssets: MediaAssetRef[] | null;
    comment: CellComment | null;
    updatedBy: string | null;
  }>
) {
  if (cells.length === 0) return;
  const now = new Date();
  const values = cells.map((c) => ({
    tableId,
    columnId: c.columnId,
    rowId: c.rowId,
    textContent: c.textContent,
    mediaAssets: stripMediaUrls(c.mediaAssets),
    comment: c.comment,
    updatedBy: c.updatedBy,
    updatedAt: now,
  }));
  // Use onConflictDoNothing so a re-run of the same undo is idempotent.
  await db.insert(productionTableCells).values(values).onConflictDoNothing();
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
// Cell comment upsert
// ---------------------------------------------------------------------------

export async function upsertCellComment(
  tableId: string,
  columnId: string,
  rowId: string,
  comment: CellComment | null,
  updatedBy: string
) {
  const [cell] = await db
    .insert(productionTableCells)
    .values({
      tableId,
      columnId,
      rowId,
      textContent: null,
      mediaAssets: null,
      comment,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [productionTableCells.columnId, productionTableCells.rowId],
      set: {
        comment,
        updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();

  await touchTable(tableId);
  return cell;
}

// ---------------------------------------------------------------------------
// Granular media-cell mutations (conflict-free add/remove by assetId)
// ---------------------------------------------------------------------------

export async function addMediaAsset(
  tableId: string,
  columnId: string,
  rowId: string,
  asset: MediaAssetRef,
  updatedBy: string
) {
  const cleanAsset: MediaAssetRef = {
    assetId: asset.assetId,
    imageId: asset.imageId,
    assetType: asset.assetType,
    ...(asset.thumbnailImageId ? { thumbnailImageId: asset.thumbnailImageId } : {}),
  };

  const assetJson = JSON.stringify(cleanAsset);

  // Atomic upsert: appends the new asset to the existing JSONB array in a
  // single statement, avoiding the read-modify-write race condition that
  // occurs when two users add assets to the same cell concurrently.
  const [cell] = await db
    .insert(productionTableCells)
    .values({
      tableId,
      columnId,
      rowId,
      textContent: null,
      mediaAssets: [cleanAsset],
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [productionTableCells.columnId, productionTableCells.rowId],
      set: {
        mediaAssets: sql`COALESCE(${productionTableCells.mediaAssets}, '[]'::jsonb) || ${assetJson}::jsonb`,
        updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();

  await touchTable(tableId);
  return cell;
}

export async function removeMediaAsset(
  tableId: string,
  columnId: string,
  rowId: string,
  assetId: string,
  updatedBy: string
) {
  // Atomic removal: filters out the asset by assetId directly in SQL,
  // avoiding the read-modify-write race condition that occurs when two
  // users modify the same cell's media assets concurrently.
  const result = await db
    .update(productionTableCells)
    .set({
      mediaAssets: sql`(
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(${productionTableCells.mediaAssets}, '[]'::jsonb)) AS elem
        WHERE elem->>'assetId' != ${assetId}
      )`,
      updatedBy,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(productionTableCells.columnId, columnId),
        eq(productionTableCells.rowId, rowId)
      )
    )
    .returning();

  if (result.length === 0) return null;

  await touchTable(tableId);
  return result[0];
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

/**
 * Ensure a user has at least viewer-level table access.
 * Called automatically when granting column/row access so the user can
 * actually open the table page.  No-ops if they already have any share
 * or are the table owner.
 */
export async function ensureTableViewerAccess(
  tableId: string,
  userId: string
) {
  const { getTablePermission } = await import("./permissions");
  const existing = await getTablePermission(tableId, userId);
  if (existing) return;

  await db
    .insert(productionTableShares)
    .values({ tableId, sharedWithUserId: userId, permission: "viewer" })
    .onConflictDoNothing();
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
  assets: MediaAssetRef[] | null,
  cnMode: boolean = false
): EnrichedMediaAssetRef[] | null {
  if (!assets) return null;
  return assets.map((a) => {
    if (a.assetType === "public_image") {
      return {
        ...a,
        imageUrl: getContentUrl(a.assetId, cnMode),
        videoUrl: undefined,
      };
    }
    if (a.assetType === "public_video") {
      return {
        ...a,
        imageUrl: undefined,
        videoUrl: getContentUrl(a.assetId, cnMode),
      };
    }
    if (a.assetType === "audio") {
      return {
        ...a,
        imageUrl: undefined,
        videoUrl: undefined,
        audioUrl: a.assetId ? getAudioUrl(a.assetId, cnMode) : undefined,
      };
    }
    return {
      ...a,
      imageUrl: a.imageId ? getImageUrl(a.imageId, cnMode) : undefined,
      videoUrl: a.assetType === "video" && a.assetId ? getVideoUrl(a.assetId, cnMode) : undefined,
    };
  });
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
