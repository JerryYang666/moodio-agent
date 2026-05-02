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

export const MAX_PRODUCTION_TABLE_ROWS = 99;
export const MAX_PRODUCTION_TABLE_COLUMNS = 99;

/** Extensible comment payload stored as JSONB on production_table_cells. */
export interface CellComment {
  text: string;
  authorId: string;
  authorName: string;
  updatedAt: string;
}

/** Stored in the DB — only IDs, never URLs. */
export interface MediaAssetRef {
  assetId: string;
  imageId: string;
  /**
   * "image" | "video" | "public_image" | "public_video" | "audio" | "group".
   * For group refs, `assetId` and `imageId` are both the group folder ID and
   * the cover image S3 ID respectively (when a cover exists).
   */
  assetType: string;
  thumbnailImageId?: string;
  /** Group refs: which folder this points to (== assetId by convention). */
  folderId?: string;
  /** Group refs: "image" | "video" — pinned modality of the group. */
  groupModality?: "image" | "video";
}

/** Enriched at read-time with derived URLs for the frontend. */
export interface EnrichedMediaAssetRef extends MediaAssetRef {
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  /** 384px WebP thumbnail for grid cells. Only populated for image assets. */
  thumbnailSmUrl?: string;
  /** 1024px WebP thumbnail for asset-picker modals. Only populated for image assets. */
  thumbnailMdUrl?: string;
  /** Group refs: live member count (refreshed at read time). */
  groupMemberCount?: number;
  /** Group refs: human name of the group folder. */
  groupName?: string;
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
  mediaAssets: EnrichedMediaAssetRef[] | null;
  comment: CellComment | null;
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

export interface RemoteCellCursor {
  sessionId: string;
  userId: string;
  userName?: string;
  x: number;
  y: number;
}

export type ProductionTableWSEvent =
  | { type: "pt_cell_selected"; tableId: string; rowId: string; columnId: string; userId: string; userName?: string }
  | { type: "pt_cell_deselected"; tableId: string; rowId: string; columnId: string; userId: string }
  | { type: "pt_cell_updated"; tableId: string; rowId: string; columnId: string; textContent?: string | null; mediaAssets?: EnrichedMediaAssetRef[] | null }
  | { type: "pt_media_asset_added"; tableId: string; rowId: string; columnId: string; asset: EnrichedMediaAssetRef }
  | { type: "pt_media_asset_removed"; tableId: string; rowId: string; columnId: string; assetId: string }
  | { type: "pt_column_added"; tableId: string; column: ProductionTableColumn }
  | { type: "pt_column_removed"; tableId: string; columnId: string }
  | { type: "pt_column_renamed"; tableId: string; columnId: string; name: string }
  | { type: "pt_column_resized"; tableId: string; columnId: string; width: number }
  | { type: "pt_columns_reordered"; tableId: string; columnIds: string[] }
  | { type: "pt_row_added"; tableId: string; row: ProductionTableRow }
  | { type: "pt_row_removed"; tableId: string; rowId: string }
  | { type: "pt_row_resized"; tableId: string; rowId: string; height: number }
  | { type: "pt_rows_reordered"; tableId: string; rowIds: string[] }
  | { type: "pt_cell_comment_updated"; tableId: string; rowId: string; columnId: string; comment: CellComment | null }
  | { type: "pt_cursor_move"; tableId: string; x: number; y: number; userId: string; userName?: string }
  | { type: "pt_cursor_leave"; tableId: string; userId: string };
