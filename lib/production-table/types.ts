import type {
  ProductionTable,
  ProductionTableColumn,
  ProductionTableRow,
  ProductionTableCell,
  ProductionTableShare,
  ProductionTableColumnShare,
  ProductionTableRowShare,
} from "@/lib/db/schema";
import type { Permission } from "@/lib/permissions";

// Re-export DB row types for convenience
export type {
  ProductionTable,
  ProductionTableColumn,
  ProductionTableRow,
  ProductionTableCell,
  ProductionTableShare,
  ProductionTableColumnShare,
  ProductionTableRowShare,
};

// ---------------------------------------------------------------------------
// Cell types
// ---------------------------------------------------------------------------

export type CellType = "text" | "media";

export interface MediaAssetRef {
  assetId: string;
  imageId: string;
  assetType: string;
  thumbnailImageId?: string;
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// Enriched types (with joined data for the frontend)
// ---------------------------------------------------------------------------

export interface EnrichedCell {
  id: string;
  tableId: string;
  columnId: string;
  rowId: string;
  textContent: string | null;
  mediaAssets: MediaAssetRef[] | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface EnrichedColumn extends ProductionTableColumn {
  /** Column-level share users (for the share modal) */
  columnShares?: ProductionTableColumnShare[];
}

export interface EnrichedRow extends ProductionTableRow {
  /** Row-level share users (for the share modal) */
  rowShares?: ProductionTableRowShare[];
}

export interface EnrichedProductionTable extends ProductionTable {
  columns: EnrichedColumn[];
  rows: EnrichedRow[];
  /** Sparse cells keyed by `${columnId}:${rowId}` for O(1) lookup */
  cellMap: Record<string, EnrichedCell>;
  /** Current user's resolved permission */
  permission: Permission | null;
  shares?: ProductionTableShare[];
}

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export interface CreateTablePayload {
  name: string;
  teamId?: string;
}

export interface AddColumnPayload {
  name: string;
  cellType: CellType;
}

export interface RenameColumnPayload {
  name: string;
}

export interface ReorderPayload {
  ids: string[];
}

export interface UpsertCellPayload {
  columnId: string;
  rowId: string;
  textContent?: string | null;
  mediaAssets?: MediaAssetRef[] | null;
}

export interface TableSharePayload {
  sharedWithUserId?: string;
  sharedWithUserIds?: string[];
  permission: "viewer" | "collaborator";
}

export interface ColumnSharePayload {
  columnIds: string[];
  sharedWithUserId?: string;
  sharedWithUserIds?: string[];
}

export interface RowSharePayload {
  rowIds: string[];
  sharedWithUserId?: string;
  sharedWithUserIds?: string[];
}

// ---------------------------------------------------------------------------
// WebSocket event types
// ---------------------------------------------------------------------------

export interface CellLock {
  userId: string;
  userName?: string;
  userColor?: string;
  rowId: string;
  columnId: string;
  expiresAt: number;
}

export type ProductionTableWSEvent =
  | { type: "pt_cell_selected"; tableId: string; rowId: string; columnId: string; userId: string; userName?: string }
  | { type: "pt_cell_deselected"; tableId: string; rowId: string; columnId: string; userId: string }
  | { type: "pt_cell_updated"; tableId: string; rowId: string; columnId: string; textContent?: string | null; mediaAssets?: MediaAssetRef[] | null }
  | { type: "pt_column_added"; tableId: string; column: ProductionTableColumn }
  | { type: "pt_column_removed"; tableId: string; columnId: string }
  | { type: "pt_column_renamed"; tableId: string; columnId: string; name: string }
  | { type: "pt_columns_reordered"; tableId: string; columnIds: string[] }
  | { type: "pt_row_added"; tableId: string; row: ProductionTableRow }
  | { type: "pt_row_removed"; tableId: string; rowId: string }
  | { type: "pt_rows_reordered"; tableId: string; rowIds: string[] }
  | { type: "pt_cursor_move"; rowId: string; columnId: string; userId: string };
