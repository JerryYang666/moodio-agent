# Operation History (Undo / Redo)

A user-scoped, system-agnostic undo/redo engine. Powers `Ctrl/Cmd+Z` and
`Ctrl/Cmd+Shift+Z` (and `Ctrl+Y`) on the infinite desktop and the production
table, and is designed to slot into any future collaborative surface.

## Overview

- **Engine is transport-agnostic.** It only knows how to push, pop, coalesce,
  and call closures. Each surface supplies its own *dispatchers* that mutate
  local state, broadcast over WebSocket, and persist over REST.
- **One history per surface, per session.** A page mount creates a fresh
  store; a page unmount discards it. Stacks never persist across reloads.
- **User-scoped.** Only the local user's actions enter the stack — `Ctrl+Z`
  never replays a collaborator's edit.
- **Optimistic and idempotent.** Forward and inverse always do the full
  triple (local + WS + REST), so redo of an undo of a redo is a no-op.
- **Native text editing wins.** `<input>`, `<textarea>`, and contenteditable
  surfaces use the browser's native text undo; the global hook ignores them.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Hooks (React surface)                                                │
│  hooks/use-undo-redo-keyboard.ts   ← window keydown listener         │
│  hooks/use-operation-history.ts    ← per-surface store + record API  │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Engine (system-agnostic)                                             │
│  lib/operation-history/types.ts     HistoryEntry, ApplyResult        │
│  lib/operation-history/store.ts     undoStack / redoStack (Zustand)  │
│  lib/operation-history/coalesce.ts  same-burst merging               │
└──────────────────────────────────────────────────────────────────────┘
                                 ▲
              ┌──────────────────┴──────────────────┐
              │                                     │
┌─────────────┴──────────────┐       ┌──────────────┴──────────────┐
│ lib/desktop/history.ts     │       │ lib/production-table/       │
│   applyAssetMove           │       │   applyCellUpdate           │
│   applyAssetTransform      │       │   applyColumnRename         │
│   applyAssetRestore  ...   │       │   applyRowRestore  ...      │
└────────────────────────────┘       └─────────────────────────────┘
              ▲                                     ▲
              │                                     │
┌─────────────┴──────────────┐       ┌──────────────┴──────────────┐
│ desktop/[desktopId]/page   │       │ production-table/[tableId]  │
└────────────────────────────┘       └─────────────────────────────┘
```

## Core types

```ts
interface HistoryEntry {
  id: string;
  userId: string;
  timestamp: number;
  label: { key: string; values?: Record<string, string | number> };
  coalesceKey?: string;
  targetIds: string[];
  forward: () => Promise<ApplyResult> | ApplyResult;  // redo
  inverse: () => Promise<ApplyResult> | ApplyResult;  // undo
}

type ApplyResult =
  | { ok: true }
  | { ok: false; reason: "target_missing" | "locked" | "network" | "permission" };
```

`ApplyResult.reason` drives the engine's reaction to a failed replay:

| reason           | meaning                              | engine action               |
| ---------------- | ------------------------------------ | --------------------------- |
| `target_missing` | entity was deleted by someone else   | drop the entry              |
| `permission`     | viewer lost write access             | drop the entry              |
| `locked`         | another user holds an editing lock   | keep on stack, can retry    |
| `network`        | transient REST failure               | keep on stack, can retry    |

## Coalescing

A typing burst or a drag should be one undo, not a hundred. Two consecutive
entries from the same user merge when they share a truthy `coalesceKey` and
land within `COALESCE_WINDOW_MS` (800 ms). The merged entry adopts the newer
`forward` (redo lands on the final state) and keeps the older `inverse` (undo
returns to the burst's starting state).

Use a `coalesceKey` for streaming inputs (typing, dragging-to-resize, slider
scrubbing). Leave it undefined for discrete actions (add, delete, reorder).

## Integrating into a surface

### 1. Mount the engine and the keyboard hook

```tsx
const history = useOperationHistory();

useUndoRedoKeyboard({
  history,
  // Optional: skip global undo while the user holds an editing lock that
  // delegates to native text undo (cell edit, text asset focus).
  disabled: useCallback(() => /* return true to bypass */ false, [/* deps */]),
});
```

### 2. Write *dispatchers* — symmetrical helpers that apply one operation

A dispatcher does the same triple in either direction:

```ts
export async function applyCellUpdate(
  deps: PTDispatchDeps,
  columnId: string,
  rowId: string,
  textContent: string | null,
  mediaAssets: MediaAssetRef[] | null
): Promise<ApplyResult> {
  // 1) Optimistic local mutation
  deps.store.getState().setCell(...);

  // 2) Broadcast to peers
  deps.sendEvent("pt_cell_updated", { ... });

  // 3) Persist via REST, narrow errors into ApplyResult
  try {
    const res = await fetch("/api/...", { method: "PUT", body: ... });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "network", message: String(e) };
  }
}
```

Pair the dispatcher with a *restore* counterpart for delete operations
(e.g. `applyColumnRestore` re-creates a column with the same `id` and its
cell content). Server endpoints accept the original `id` and return `409`
on conflict so redo-after-undo is idempotent.

### 3. Record one entry per user action

Snapshot prior state *before* the optimistic update, then call `record` with
two closures bound to before/after values:

```ts
const prev = currentState();
applyMutationLocally(next);

if (changed(prev, next)) {
  history.record({
    userId: user?.id ?? "",
    label: { key: "editCell" },                     // i18n key
    coalesceKey: `pt-cell:${columnId}:${rowId}`,    // optional
    targetIds: [`${columnId}:${rowId}`],
    forward: () => applyCellUpdate(deps, columnId, rowId, next.text, next.media),
    inverse: () => applyCellUpdate(deps, columnId, rowId, prev.text, prev.media),
  });
}
```

**Capture closures, not refs.** `prev` is captured by value into the closure,
so it survives later state changes. Use a stable `historyDepsRef` to feed
dispatchers the latest `applyRemoteEvent` / `sendEvent` / `getAssets`.

**One user action = one entry.** If a single gesture changes multiple axes
(e.g. a resize from a corner handle that also shifts position), expose a
combined dispatcher and record once — never split into two `record` calls.

### 4. Localize labels

Toast text is resolved at undo/redo time via `next-intl`:

```json
"history": {
  "undone": "Undone: {action}",
  "redone": "Redone: {action}",
  "actions": {
    "editCell":   "Edit cell",
    "moveAssets": "Move {count} assets"
  }
}
```

`label.key` is appended to `history.actions`; `label.values` feeds ICU
interpolation (counts, names). Keys live in every locale file in `messages/`.

## Limits and defaults

| Constant            | Value | Purpose                                  |
| ------------------- | ----- | ---------------------------------------- |
| `MAX_STACK_SIZE`    | 100   | per-surface cap; oldest entries FIFO out |
| `COALESCE_WINDOW_MS`| 800   | merging window for same-key bursts       |

Stacks are in-memory only. Recording a new forward action clears the redo
stack (standard editor UX). All shortcuts respect `disabled` and skip when
the event target is a text-editing surface.

## Server contract for restoration

Endpoints used by inverse-of-delete dispatchers must:

- Accept an explicit `id` in the create payload (so the restored entity
  retains its original identity and references).
- Return `409` on id conflict — dispatchers treat `409` as success since the
  desired state already holds (e.g. a peer restored the same entity).

Examples: `POST /api/desktop/[id]/assets`,
`POST /api/production-table/[tableId]/columns`,
`POST /api/production-table/[tableId]/rows`.

## Files

| Path                                     | Role                                  |
| ---------------------------------------- | ------------------------------------- |
| `lib/operation-history/types.ts`         | `HistoryEntry`, `ApplyResult`, limits |
| `lib/operation-history/store.ts`         | Zustand engine (record/undo/redo)     |
| `lib/operation-history/coalesce.ts`      | Burst-merge policy                    |
| `hooks/use-operation-history.ts`         | Per-surface React API                 |
| `hooks/use-undo-redo-keyboard.ts`        | Window-level shortcut listener        |
| `lib/desktop/history.ts`                 | Desktop dispatchers                   |
| `lib/production-table/history.ts`        | Production-table dispatchers          |
