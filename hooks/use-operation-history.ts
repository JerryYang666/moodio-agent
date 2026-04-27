"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  createHistoryStore,
  useHistoryFlags,
  type HistoryStore,
} from "@/lib/operation-history/store";
import type { ApplyResult, HistoryEntry } from "@/lib/operation-history/types";

/**
 * Input for `record`. The caller supplies everything *except* the entry id
 * and timestamp — those are generated here so handler sites stay terse.
 */
export type RecordInput = Omit<HistoryEntry, "id" | "timestamp">;

export interface OperationHistoryAPI {
  /** Stable store instance for advanced subscriptions. */
  store: HistoryStore;
  /** Record a new forward entry. Clears redo; may coalesce with the previous. */
  record: (input: RecordInput) => void;
  /** Revert the most recent user action. */
  undo: () => Promise<ApplyResult | null>;
  /** Replay the most recently undone action. */
  redo: () => Promise<ApplyResult | null>;
  /** Clear all entries (e.g. on surface change). */
  clear: () => void;
  /** Reactive: true when there's at least one undoable entry. */
  canUndo: boolean;
  /** Reactive: true when there's at least one redoable entry. */
  canRedo: boolean;
}

/**
 * One history instance per surface. The store is created once on mount and
 * preserved across re-renders. Unmounting the hook clears the stacks (so
 * reloading a page resets history, matching the session-scoped design).
 */
export function useOperationHistory(): OperationHistoryAPI {
  const storeRef = useRef<HistoryStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createHistoryStore();
  }
  const store = storeRef.current;

  const { canUndo, canRedo } = useHistoryFlags(store);

  const record = useCallback(
    (input: RecordInput) => {
      const entry: HistoryEntry = {
        ...input,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        timestamp: Date.now(),
      };
      store.getState().record(entry);
    },
    [store]
  );

  const undo = useCallback(() => store.getState().undo(), [store]);
  const redo = useCallback(() => store.getState().redo(), [store]);
  const clear = useCallback(() => store.getState().clear(), [store]);

  return useMemo(
    () => ({ store, record, undo, redo, clear, canUndo, canRedo }),
    [store, record, undo, redo, clear, canUndo, canRedo]
  );
}
