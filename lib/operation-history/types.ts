/**
 * Shared types for the user-scoped operation-history engine. The engine is
 * system-agnostic — it's used by both the infinite desktop and the production
 * table. Per-system adapters build `HistoryEntry` values that know how to
 * replay a forward action and how to invert it.
 */

/**
 * Result of running forward/inverse. On failure the engine decides whether
 * to drop the entry, keep it (for retry), or fall through.
 *
 * - `target_missing`: the entity being mutated no longer exists (e.g. another
 *   user deleted the row). Entry will be dropped.
 * - `locked`: another user holds a lock on the target. Entry stays in the
 *   stack; user can retry after the lock clears.
 * - `network` / `permission`: transient — entry stays in the stack.
 */
export type ApplyResult =
  | { ok: true }
  | { ok: false; reason: "target_missing" | "locked" | "network" | "permission"; message?: string };

export interface HistoryEntry {
  /** Stable uuid for the entry. Useful for coalescing and tests. */
  id: string;
  /** The user who created this entry. Always captured at record-time. */
  userId: string;
  /** ms since epoch. Used for coalesce-window checks. */
  timestamp: number;
  /** Human-readable label, used in toasts ("Undo delete row"). */
  label: string;
  /**
   * Optional coalesce key. If two consecutive entries by the same user share
   * the same key within `COALESCE_WINDOW_MS`, they are merged — the newer
   * entry's `forward` replaces the prior entry's `forward`, but the prior
   * entry's `inverse` is kept (so one undo restores the original state).
   */
  coalesceKey?: string;
  /**
   * IDs of entities this entry mutates (e.g. `assetId`, `${columnId}:${rowId}`).
   * Used by conflict checks to detect "target was deleted by someone else".
   */
  targetIds: string[];
  /** Re-apply the original action. Called by redo. */
  forward: () => Promise<ApplyResult> | ApplyResult;
  /** Revert the action. Called by undo. */
  inverse: () => Promise<ApplyResult> | ApplyResult;
}

/**
 * Snapshot of engine state for a single surface (one production table or
 * one desktop). Undo pops from `undoStack` and pushes to `redoStack`; redo
 * does the opposite. Any new forward `record` clears `redoStack`.
 */
export interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

/** Default coalescing window (ms). Rapid typing / drag frames merge into one. */
export const COALESCE_WINDOW_MS = 800;

/** Maximum entries per surface; oldest entries are dropped FIFO. */
export const MAX_STACK_SIZE = 100;
