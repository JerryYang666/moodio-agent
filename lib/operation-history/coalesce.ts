import type { HistoryEntry } from "./types";
import { COALESCE_WINDOW_MS } from "./types";

/**
 * Two entries coalesce when they come from the same user, share the same
 * (truthy) `coalesceKey`, and are within the default time window. The goal
 * is one undo per editing burst (a drag, a typing session) rather than one
 * per intermediate frame.
 */
export function shouldCoalesce(
  prev: HistoryEntry | undefined,
  next: HistoryEntry
): boolean {
  if (!prev) return false;
  if (!prev.coalesceKey || !next.coalesceKey) return false;
  if (prev.coalesceKey !== next.coalesceKey) return false;
  if (prev.userId !== next.userId) return false;
  return next.timestamp - prev.timestamp <= COALESCE_WINDOW_MS;
}

/**
 * Merge two coalescable entries. The merged entry keeps the *original*
 * inverse (so one undo restores state as it was before the burst started)
 * and adopts the newest forward (so redo produces the final state).
 */
export function mergeEntries(
  prev: HistoryEntry,
  next: HistoryEntry
): HistoryEntry {
  return {
    ...next,
    inverse: prev.inverse,
    // Keep the prev id so observers (if any) see a stable identity through
    // the coalesce. Timestamp tracks the most recent activity.
    id: prev.id,
  };
}
