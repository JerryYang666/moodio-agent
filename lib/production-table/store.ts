import { createStore, useStore } from "zustand";
import type {
  EnrichedCell,
  EnrichedMediaAssetRef,
  CellLock,
  CellComment,
  ProductionTableColumn,
  ProductionTableRow,
} from "./types";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface ProductionTableStoreState {
  columns: ProductionTableColumn[];
  rows: ProductionTableRow[];
  cellMap: Record<string, EnrichedCell>;
  cellLocks: Map<string, CellLock>;

  // Bulk setters (called from page-level handlers)
  setColumns: (columns: ProductionTableColumn[]) => void;
  setRows: (rows: ProductionTableRow[]) => void;

  // Cell-level mutations (granular, no full-cellMap clone)
  updateCell: (key: string, patch: Partial<EnrichedCell>) => void;
  setCell: (key: string, cell: EnrichedCell) => void;
  addMediaAsset: (key: string, asset: EnrichedMediaAssetRef, defaults: Partial<EnrichedCell>) => void;
  removeMediaAsset: (key: string, assetId: string) => void;
  updateCellComment: (key: string, comment: CellComment | null, defaults: Partial<EnrichedCell>) => void;

  // Cell lock mutations
  setCellLock: (key: string, lock: CellLock) => void;
  removeCellLock: (key: string) => void;
  removeCellLocksByUserId: (userId: string) => void;
  expireStaleLocks: () => void;

  // Full hydration (after fetch)
  hydrate: (data: {
    columns: ProductionTableColumn[];
    rows: ProductionTableRow[];
    cellMap: Record<string, EnrichedCell>;
  }) => void;
}

export type ProductionTableStore = ReturnType<typeof createProductionTableStore>;

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export function createProductionTableStore() {
  return createStore<ProductionTableStoreState>((set, get) => ({
    columns: [],
    rows: [],
    cellMap: {},
    cellLocks: new Map(),

    setColumns: (columns) => set({ columns }),
    setRows: (rows) => set({ rows }),

    updateCell: (key, patch) =>
      set((state) => {
        const existing = state.cellMap[key];
        if (!existing && Object.keys(patch).length === 0) return state;
        const updated = { ...(existing ?? {}), ...patch } as EnrichedCell;
        return { cellMap: { ...state.cellMap, [key]: updated } };
      }),

    setCell: (key, cell) =>
      set((state) => ({ cellMap: { ...state.cellMap, [key]: cell } })),

    addMediaAsset: (key, asset, defaults) =>
      set((state) => {
        const existing = state.cellMap[key];
        const currentAssets = (existing?.mediaAssets as EnrichedMediaAssetRef[]) ?? [];
        const updated = {
          ...(existing ?? defaults),
          mediaAssets: [...currentAssets, asset],
        } as EnrichedCell;
        return { cellMap: { ...state.cellMap, [key]: updated } };
      }),

    removeMediaAsset: (key, assetId) =>
      set((state) => {
        const existing = state.cellMap[key];
        if (!existing) return state;
        const currentAssets = (existing.mediaAssets as EnrichedMediaAssetRef[]) ?? [];
        const updated = {
          ...existing,
          mediaAssets: currentAssets.filter((a) => a.assetId !== assetId),
        } as EnrichedCell;
        return { cellMap: { ...state.cellMap, [key]: updated } };
      }),

    updateCellComment: (key, comment, defaults) =>
      set((state) => {
        const existing = state.cellMap[key];
        const updated = {
          ...(existing ?? defaults),
          comment,
        } as EnrichedCell;
        return { cellMap: { ...state.cellMap, [key]: updated } };
      }),

    setCellLock: (key, lock) =>
      set((state) => {
        const next = new Map(state.cellLocks);
        next.set(key, lock);
        return { cellLocks: next };
      }),

    removeCellLock: (key) =>
      set((state) => {
        if (!state.cellLocks.has(key)) return state;
        const next = new Map(state.cellLocks);
        next.delete(key);
        return { cellLocks: next };
      }),

    removeCellLocksByUserId: (userId) =>
      set((state) => {
        let changed = false;
        const next = new Map(state.cellLocks);
        for (const [key, lock] of next) {
          if (lock.userId === userId) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? { cellLocks: next } : state;
      }),

    expireStaleLocks: () =>
      set((state) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(state.cellLocks);
        for (const [key, lock] of next) {
          if (lock.expiresAt < now) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? { cellLocks: next } : state;
      }),

    hydrate: (data) =>
      set({
        columns: data.columns,
        rows: data.rows,
        cellMap: data.cellMap,
      }),
  }));
}

// ---------------------------------------------------------------------------
// React hooks for consuming the store
// ---------------------------------------------------------------------------

/**
 * Subscribe to a single cell's data. Only re-renders when that cell changes.
 */
export function useCellData(store: ProductionTableStore, key: string): EnrichedCell | undefined {
  return useStore(store, (s) => s.cellMap[key]);
}

/**
 * Subscribe to a single cell lock. Only re-renders when that lock changes.
 */
export function useCellLock(store: ProductionTableStore, key: string): CellLock | undefined {
  return useStore(store, (s) => s.cellLocks.get(key));
}
