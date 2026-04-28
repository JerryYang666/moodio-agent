/**
 * Production-table adapter for the shared operation-history engine.
 *
 * Each dispatcher performs the full triple (optimistic store mutation, WS
 * broadcast, REST persist) so that forward and inverse are symmetrical —
 * the page just passes two closures that call these helpers with the right
 * payload for the op being recorded.
 */

import type { ApplyResult } from "@/lib/operation-history/types";
import type { ProductionTableStore } from "./store";
import type {
  CellComment,
  EnrichedCell,
  EnrichedMediaAssetRef,
  ProductionTableColumn,
  ProductionTableRow,
  EnrichedProductionTable,
} from "./types";

/** Shape of the WS broadcast function from `useProductionTableWS`. */
export type SendEvent = (type: string, payload: Record<string, unknown>) => void;

export interface PTDispatchDeps {
  tableId: string;
  store: ProductionTableStore;
  sendEvent: SendEvent;
  /**
   * Mutator from the page's `setTable` so non-cell state (columns, rows,
   * reordering) can be updated in one place. Kept narrow — history only
   * uses it for bookkeeping, not for rehydration.
   */
  setTable: (
    updater: (prev: EnrichedProductionTable | null) => EnrichedProductionTable | null
  ) => void;
  /** Current user id; stamped into cells when we write them optimistically. */
  currentUserId: string | null;
}

function networkError(e: unknown): ApplyResult {
  return {
    ok: false,
    reason: "network",
    message: e instanceof Error ? e.message : "Network error",
  };
}

/** Key cells by `${columnId}:${rowId}` — same convention the store uses. */
function cellKey(columnId: string, rowId: string) {
  return `${columnId}:${rowId}`;
}

function cellDefaults(
  deps: PTDispatchDeps,
  columnId: string,
  rowId: string
): Partial<EnrichedCell> {
  return {
    id: "",
    tableId: deps.tableId,
    columnId,
    rowId,
    textContent: null,
    mediaAssets: null,
    comment: null,
    updatedAt: new Date(),
    updatedBy: deps.currentUserId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Cell content
// ---------------------------------------------------------------------------

/**
 * Replace a cell's text and/or media content. `textContent: undefined` /
 * `mediaAssets: undefined` keep the existing value on that axis; `null`
 * clears it. Matches the API's semantics.
 */
export async function applyCellUpdate(
  deps: PTDispatchDeps,
  columnId: string,
  rowId: string,
  textContent: string | null | undefined,
  mediaAssets: EnrichedMediaAssetRef[] | null | undefined
): Promise<ApplyResult> {
  const key = cellKey(columnId, rowId);
  const existing = deps.store.getState().cellMap[key];
  deps.store.getState().setCell(key, {
    ...(existing ?? cellDefaults(deps, columnId, rowId)),
    textContent: textContent !== undefined ? textContent : existing?.textContent ?? null,
    mediaAssets: mediaAssets !== undefined ? mediaAssets : existing?.mediaAssets ?? null,
  } as EnrichedCell);

  deps.sendEvent("pt_cell_updated", {
    tableId: deps.tableId,
    rowId,
    columnId,
    textContent,
    mediaAssets,
  });

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/cells`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId, rowId, textContent, mediaAssets }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Replace a cell's comment with `comment` (or clear if null). */
export async function applyCellCommentUpdate(
  deps: PTDispatchDeps,
  columnId: string,
  rowId: string,
  comment: CellComment | null
): Promise<ApplyResult> {
  const key = cellKey(columnId, rowId);
  deps.store.getState().updateCellComment(key, comment, cellDefaults(deps, columnId, rowId));

  deps.sendEvent("pt_cell_comment_updated", {
    tableId: deps.tableId,
    rowId,
    columnId,
    comment,
  });

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/cells/comment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId, rowId, comment }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Add a single media asset to a cell. */
export async function applyMediaAdd(
  deps: PTDispatchDeps,
  columnId: string,
  rowId: string,
  asset: EnrichedMediaAssetRef
): Promise<ApplyResult> {
  const key = cellKey(columnId, rowId);
  deps.store.getState().addMediaAsset(key, asset, cellDefaults(deps, columnId, rowId));

  deps.sendEvent("pt_media_asset_added", {
    tableId: deps.tableId,
    rowId,
    columnId,
    asset,
  });

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/cells/add-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId, rowId, asset }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Remove a media asset (by assetId) from a cell. */
export async function applyMediaRemove(
  deps: PTDispatchDeps,
  columnId: string,
  rowId: string,
  assetId: string
): Promise<ApplyResult> {
  const key = cellKey(columnId, rowId);
  deps.store.getState().removeMediaAsset(key, assetId);

  deps.sendEvent("pt_media_asset_removed", {
    tableId: deps.tableId,
    rowId,
    columnId,
    assetId,
  });

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/cells/remove-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId, rowId, assetId }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

// ---------------------------------------------------------------------------
// Column/row structural ops
// ---------------------------------------------------------------------------

/**
 * Rename a column. Used for both forward renames and the inverse of a prior
 * rename (restoring the old name).
 */
export async function applyColumnRename(
  deps: PTDispatchDeps,
  columnId: string,
  name: string
): Promise<ApplyResult> {
  deps.setTable((prev) =>
    prev
      ? {
          ...prev,
          columns: prev.columns.map((c) => (c.id === columnId ? { ...c, name } : c)),
        }
      : prev
  );
  deps.store.getState().setColumns(
    deps.store.getState().columns.map((c) => (c.id === columnId ? { ...c, name } : c))
  );
  deps.sendEvent("pt_column_renamed", { tableId: deps.tableId, columnId, name });

  try {
    const res = await fetch(
      `/api/production-table/${deps.tableId}/columns/${columnId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }
    );
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Resize a column to `width`. */
export async function applyColumnResize(
  deps: PTDispatchDeps,
  columnId: string,
  width: number
): Promise<ApplyResult> {
  deps.setTable((prev) =>
    prev
      ? {
          ...prev,
          columns: prev.columns.map((c) => (c.id === columnId ? { ...c, width } : c)),
        }
      : prev
  );
  deps.sendEvent("pt_column_resized", { tableId: deps.tableId, columnId, width });

  try {
    const res = await fetch(
      `/api/production-table/${deps.tableId}/columns/${columnId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width }),
      }
    );
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Resize a row to `height`. */
export async function applyRowResize(
  deps: PTDispatchDeps,
  rowId: string,
  height: number
): Promise<ApplyResult> {
  deps.setTable((prev) =>
    prev
      ? {
          ...prev,
          rows: prev.rows.map((r) => (r.id === rowId ? { ...r, height } : r)),
        }
      : prev
  );
  deps.sendEvent("pt_row_resized", { tableId: deps.tableId, rowId, height });

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/rows/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ height }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Apply a full column order (list of column ids in desired order). */
export async function applyColumnsReorder(
  deps: PTDispatchDeps,
  columnIds: string[]
): Promise<ApplyResult> {
  deps.setTable((prev) => {
    if (!prev) return prev;
    const colMap = new Map(prev.columns.map((c) => [c.id, c]));
    const reordered = columnIds
      .map((id) => colMap.get(id))
      .filter(Boolean) as ProductionTableColumn[];
    return { ...prev, columns: reordered };
  });
  const current = deps.store.getState().columns;
  const colMap = new Map(current.map((c) => [c.id, c]));
  const reorderedStore = columnIds
    .map((id) => colMap.get(id))
    .filter(Boolean) as ProductionTableColumn[];
  deps.store.getState().setColumns(reorderedStore);

  deps.sendEvent("pt_columns_reordered", { tableId: deps.tableId, columnIds });

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/columns/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnIds }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Apply a full row order. */
export async function applyRowsReorder(
  deps: PTDispatchDeps,
  rowIds: string[]
): Promise<ApplyResult> {
  deps.setTable((prev) => {
    if (!prev) return prev;
    const rowMap = new Map(prev.rows.map((r) => [r.id, r]));
    const reordered = rowIds
      .map((id) => rowMap.get(id))
      .filter(Boolean) as ProductionTableRow[];
    return { ...prev, rows: reordered };
  });
  const current = deps.store.getState().rows;
  const rowMap = new Map(current.map((r) => [r.id, r]));
  const reorderedStore = rowIds
    .map((id) => rowMap.get(id))
    .filter(Boolean) as ProductionTableRow[];
  deps.store.getState().setRows(reorderedStore);

  deps.sendEvent("pt_rows_reordered", { tableId: deps.tableId, rowIds });

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/rows/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowIds }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/**
 * Delete a column (no snapshot capture — caller is expected to snapshot
 * the column + its cells separately for inverse restoration).
 */
export async function applyColumnDelete(
  deps: PTDispatchDeps,
  columnId: string
): Promise<ApplyResult> {
  deps.setTable((prev) =>
    prev ? { ...prev, columns: prev.columns.filter((c) => c.id !== columnId) } : prev
  );
  deps.store
    .getState()
    .setColumns(deps.store.getState().columns.filter((c) => c.id !== columnId));
  deps.sendEvent("pt_column_removed", { tableId: deps.tableId, columnId });

  try {
    const res = await fetch(
      `/api/production-table/${deps.tableId}/columns/${columnId}`,
      { method: "DELETE" }
    );
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (!res.ok && res.status !== 404) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Delete a row (see `applyColumnDelete` for symmetry). */
export async function applyRowDelete(
  deps: PTDispatchDeps,
  rowId: string
): Promise<ApplyResult> {
  deps.setTable((prev) =>
    prev ? { ...prev, rows: prev.rows.filter((r) => r.id !== rowId) } : prev
  );
  deps.store.getState().setRows(deps.store.getState().rows.filter((r) => r.id !== rowId));
  deps.sendEvent("pt_row_removed", { tableId: deps.tableId, rowId });

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/rows/${rowId}`, {
      method: "DELETE",
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (!res.ok && res.status !== 404) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

// ---------------------------------------------------------------------------
// Restoration (for undoing a delete)
// ---------------------------------------------------------------------------

/**
 * Re-create a previously deleted column, re-inserting its cells in the same
 * operation. Position in the column list is driven by the snapshot's index.
 */
export async function applyColumnRestore(
  deps: PTDispatchDeps,
  column: ProductionTableColumn,
  cells: EnrichedCell[],
  insertIndex: number
): Promise<ApplyResult> {
  // Optimistic: drop the column back into local state in its original slot.
  deps.setTable((prev) => {
    if (!prev) return prev;
    const cols = [...prev.columns];
    cols.splice(insertIndex, 0, column);
    return { ...prev, columns: cols };
  });
  const storeCols = [...deps.store.getState().columns];
  storeCols.splice(insertIndex, 0, column);
  deps.store.getState().setColumns(storeCols);

  for (const cell of cells) {
    const key = cellKey(cell.columnId, cell.rowId);
    deps.store.getState().setCell(key, { ...cell });
  }

  deps.sendEvent("pt_column_added", { tableId: deps.tableId, column });
  // The `pt_column_added` receiver always appends to the end. Follow up
  // with a reorder broadcast so peers see the column reappear in its
  // original slot — same pattern handleInsertColumn / handleInsertRow use.
  deps.sendEvent("pt_columns_reordered", {
    tableId: deps.tableId,
    columnIds: storeCols.map((c) => c.id),
  });
  // Also re-broadcast cell content so peers see it reappear.
  for (const cell of cells) {
    deps.sendEvent("pt_cell_updated", {
      tableId: deps.tableId,
      rowId: cell.rowId,
      columnId: cell.columnId,
      textContent: cell.textContent,
      mediaAssets: cell.mediaAssets,
    });
  }

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: column.id,
        name: column.name,
        cellType: column.cellType,
        width: column.width,
        sortOrder: column.sortOrder,
        cells: cells.map((c) => ({
          rowId: c.rowId,
          textContent: c.textContent,
          mediaAssets: c.mediaAssets,
          comment: c.comment,
          updatedBy: c.updatedBy,
        })),
      }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 409) {
      // Column already exists — treat as success (redo of an undo).
      return { ok: true };
    }
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

export async function applyRowRestore(
  deps: PTDispatchDeps,
  row: ProductionTableRow,
  cells: EnrichedCell[],
  insertIndex: number
): Promise<ApplyResult> {
  deps.setTable((prev) => {
    if (!prev) return prev;
    const rows = [...prev.rows];
    rows.splice(insertIndex, 0, row);
    return { ...prev, rows };
  });
  const storeRows = [...deps.store.getState().rows];
  storeRows.splice(insertIndex, 0, row);
  deps.store.getState().setRows(storeRows);

  for (const cell of cells) {
    const key = cellKey(cell.columnId, cell.rowId);
    deps.store.getState().setCell(key, { ...cell });
  }

  deps.sendEvent("pt_row_added", { tableId: deps.tableId, row });
  // The `pt_row_added` receiver always appends to the end. Follow up with
  // a reorder broadcast so peers see the row reappear in its original
  // slot — same pattern handleInsertRow uses for mid-table inserts.
  deps.sendEvent("pt_rows_reordered", {
    tableId: deps.tableId,
    rowIds: storeRows.map((r) => r.id),
  });
  for (const cell of cells) {
    deps.sendEvent("pt_cell_updated", {
      tableId: deps.tableId,
      rowId: cell.rowId,
      columnId: cell.columnId,
      textContent: cell.textContent,
      mediaAssets: cell.mediaAssets,
    });
  }

  try {
    const res = await fetch(`/api/production-table/${deps.tableId}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        height: row.height,
        sortOrder: row.sortOrder,
        cells: cells.map((c) => ({
          columnId: c.columnId,
          textContent: c.textContent,
          mediaAssets: c.mediaAssets,
          comment: c.comment,
          updatedBy: c.updatedBy,
        })),
      }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 409) return { ok: true };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}
