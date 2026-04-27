import { createStore, useStore } from "zustand";
import type { ApplyResult, HistoryEntry, HistoryState } from "./types";
import { MAX_STACK_SIZE } from "./types";
import { mergeEntries, shouldCoalesce } from "./coalesce";

/**
 * Per-surface operation-history store. One instance per mounted surface
 * (production table page, desktop page). Stacks are in-memory only and
 * reset when the surface unmounts.
 *
 * The store is transport-agnostic — it calls `forward` / `inverse` closures
 * supplied by the caller, which are responsible for mutating local state,
 * broadcasting the WebSocket event, and persisting via REST.
 */

/**
 * Outcome of an undo/redo call. When `entry` is present the engine attempted
 * to apply it; callers (e.g. toast notifications) can read the entry's label
 * to tell the user what just happened.
 */
export interface HistoryOutcome {
  result: ApplyResult;
  entry: HistoryEntry;
}

interface Actions {
  /** Push a new forward entry. Clears the redo stack. May coalesce. */
  record: (entry: HistoryEntry) => void;
  /** Pop the newest entry off the undo stack and run its inverse. */
  undo: () => Promise<HistoryOutcome | null>;
  /** Pop the newest entry off the redo stack and run its forward. */
  redo: () => Promise<HistoryOutcome | null>;
  /** Remove the top undo entry without running it (e.g. on conflict skip). */
  discardTopUndo: () => void;
  /** Clear all history (e.g. surface unmount, catastrophic reload). */
  clear: () => void;
}

export interface HistoryStoreState extends HistoryState, Actions {
  /** True when there's at least one entry to undo. */
  canUndo: boolean;
  /** True when there's at least one entry to redo. */
  canRedo: boolean;
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;

/**
 * Factory: create a fresh history store. A store is a standalone instance,
 * not a global singleton, so two surfaces in different tabs get independent
 * stacks.
 */
export function createHistoryStore() {
  return createStore<HistoryStoreState>((set, get) => ({
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,

    record: (entry) => {
      set((state) => {
        const last = state.undoStack[state.undoStack.length - 1];
        let nextUndo: HistoryEntry[];

        if (shouldCoalesce(last, entry)) {
          nextUndo = state.undoStack.slice(0, -1);
          nextUndo.push(mergeEntries(last, entry));
        } else {
          nextUndo = [...state.undoStack, entry];
          if (nextUndo.length > MAX_STACK_SIZE) {
            // FIFO drop: remove oldest
            nextUndo = nextUndo.slice(nextUndo.length - MAX_STACK_SIZE);
          }
        }

        return {
          undoStack: nextUndo,
          // Any new user action clears the redo stack. This is the standard
          // undo/redo UX — once you do something new, there's no "forward"
          // history to replay.
          redoStack: [],
          canUndo: nextUndo.length > 0,
          canRedo: false,
        };
      });
    },

    undo: async () => {
      const state = get();
      const entry = state.undoStack[state.undoStack.length - 1];
      if (!entry) return null;

      // Pop optimistically — if the inverse reports a dropped target we
      // leave it popped; if it's transient (locked/network) we put it back.
      set({
        undoStack: state.undoStack.slice(0, -1),
        canUndo: state.undoStack.length - 1 > 0,
      });

      const result = await entry.inverse();

      if (result.ok) {
        set((s) => ({
          redoStack: [...s.redoStack, entry],
          canRedo: true,
        }));
      } else if (result.reason === "locked" || result.reason === "network") {
        // Transient: put the entry back so the user can retry.
        set((s) => ({
          undoStack: [...s.undoStack, entry],
          canUndo: true,
        }));
      }
      // `target_missing` / `permission`: entry is dropped.

      return { result, entry };
    },

    redo: async () => {
      const state = get();
      const entry = state.redoStack[state.redoStack.length - 1];
      if (!entry) return null;

      set({
        redoStack: state.redoStack.slice(0, -1),
        canRedo: state.redoStack.length - 1 > 0,
      });

      const result = await entry.forward();

      if (result.ok) {
        set((s) => ({
          undoStack: [...s.undoStack, entry],
          canUndo: true,
        }));
      } else if (result.reason === "locked" || result.reason === "network") {
        set((s) => ({
          redoStack: [...s.redoStack, entry],
          canRedo: true,
        }));
      }

      return { result, entry };
    },

    discardTopUndo: () => {
      set((state) => ({
        undoStack: state.undoStack.slice(0, -1),
        canUndo: state.undoStack.length - 1 > 0,
      }));
    },

    clear: () => set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false }),
  }));
}

/** React subscription helper: returns `canUndo` / `canRedo` booleans. */
export function useHistoryFlags(store: HistoryStore): {
  canUndo: boolean;
  canRedo: boolean;
} {
  const canUndo = useStore(store, (s) => s.canUndo);
  const canRedo = useStore(store, (s) => s.canRedo);
  return { canUndo, canRedo };
}
