/**
 * Desktop (infinite canvas) adapter for the shared operation-history engine.
 *
 * The dispatchers here encapsulate the "triple" each user action performs:
 *   1. Apply an optimistic update to local React state.
 *   2. Broadcast a WebSocket event so collaborators see the change.
 *   3. Persist to the database via REST.
 *
 * Each exported helper does the same triple in either direction (forward or
 * inverse), so callers record a history entry by passing two closures that
 * invoke these helpers with the right payload.
 */

import type { EnrichedDesktopAsset } from "@/components/desktop/assets";
import type { ApplyResult } from "@/lib/operation-history/types";

/** Shape of the local-state mutator passed in from `useDesktopDetail`. */
export type ApplyRemoteEvent = (event: { type: string; payload: unknown }) => void;

/** Shape of the WS broadcast function passed in from `useDesktopWebSocket`. */
export type SendEvent = (type: string, payload: Record<string, unknown>) => void;

export interface DesktopDispatchDeps {
  desktopId: string;
  applyRemoteEvent: ApplyRemoteEvent;
  sendEvent: SendEvent;
  /**
   * Read the current asset list. Used by inverse builders that need to check
   * whether a target still exists before replaying.
   */
  getAssets: () => readonly EnrichedDesktopAsset[];
}

/** Narrow error bucket used by all dispatchers. */
function networkError(e: unknown): ApplyResult {
  return {
    ok: false,
    reason: "network",
    message: e instanceof Error ? e.message : "Network error",
  };
}

// ---------------------------------------------------------------------------
// Position / size / z-index
// ---------------------------------------------------------------------------

/**
 * Move an asset to an absolute (posX, posY). Used for both the forward drag
 * and the inverse of a drag.
 */
export async function applyAssetMove(
  deps: DesktopDispatchDeps,
  assetId: string,
  posX: number,
  posY: number
): Promise<ApplyResult> {
  if (!deps.getAssets().some((a) => a.id === assetId)) {
    return { ok: false, reason: "target_missing" };
  }
  deps.applyRemoteEvent({ type: "asset_moved", payload: { assetId, posX, posY } });
  deps.sendEvent("asset_moved", { assetId, posX, posY });
  try {
    const res = await fetch(`/api/desktop/${deps.desktopId}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posX, posY }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/**
 * Resize an asset and optionally shift its position in the same operation.
 * Used for resize gestures from any handle: the bottom-right (`se`) handle
 * keeps `posX/posY` equal to the prior values, while handles that anchor the
 * opposite corner (`nw`/`ne`/`sw`/`n`/`w`) shift `posX/posY` so the anchor
 * stays steady. Either way the gesture is one user action — one history
 * entry, one PATCH, one broadcast pair.
 */
export async function applyAssetTransform(
  deps: DesktopDispatchDeps,
  assetId: string,
  width: number,
  height: number,
  posX: number,
  posY: number
): Promise<ApplyResult> {
  if (!deps.getAssets().some((a) => a.id === assetId)) {
    return { ok: false, reason: "target_missing" };
  }
  deps.applyRemoteEvent({
    type: "asset_resized",
    payload: { assetId, width, height },
  });
  deps.applyRemoteEvent({ type: "asset_moved", payload: { assetId, posX, posY } });
  deps.sendEvent("asset_resized", { assetId, width, height });
  deps.sendEvent("asset_moved", { assetId, posX, posY });
  try {
    const res = await fetch(`/api/desktop/${deps.desktopId}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width, height, posX, posY }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Change the z-index (bring to front / send to back). */
export async function applyZIndex(
  deps: DesktopDispatchDeps,
  assetId: string,
  zIndex: number
): Promise<ApplyResult> {
  if (!deps.getAssets().some((a) => a.id === assetId)) {
    return { ok: false, reason: "target_missing" };
  }
  deps.applyRemoteEvent({ type: "asset_z_changed", payload: { assetId, zIndex } });
  deps.sendEvent("asset_z_changed", { assetId, zIndex });
  try {
    const res = await fetch(`/api/desktop/${deps.desktopId}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zIndex }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

// ---------------------------------------------------------------------------
// Add / remove asset
// ---------------------------------------------------------------------------

/**
 * Remove an asset from the canvas. Used both for a user-initiated delete
 * (forward) and for undoing a user-initiated create (inverse).
 */
export async function applyAssetRemove(
  deps: DesktopDispatchDeps,
  assetId: string
): Promise<ApplyResult> {
  const exists = deps.getAssets().some((a) => a.id === assetId);
  if (!exists) {
    // Already gone — treat as success to keep undo/redo idempotent.
    return { ok: true };
  }
  deps.applyRemoteEvent({ type: "asset_removed", payload: { assetId } });
  deps.sendEvent("asset_removed", { assetId });
  try {
    const res = await fetch(`/api/desktop/${deps.desktopId}/assets/${assetId}`, {
      method: "DELETE",
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    // 404 is fine — the remote side may have already deleted it.
    if (!res.ok && res.status !== 404) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/**
 * Re-add an asset with its original id. Used when undoing a delete. The
 * server enforces id-uniqueness; a 409 means another user (or a redo) has
 * already restored the asset, which we treat as a no-op success.
 */
export async function applyAssetRestore(
  deps: DesktopDispatchDeps,
  asset: EnrichedDesktopAsset
): Promise<ApplyResult> {
  // Optimistic: put it back in local state so the user sees it instantly.
  deps.applyRemoteEvent({ type: "asset_added", payload: { asset } });
  try {
    const res = await fetch(`/api/desktop/${deps.desktopId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assets: [
          {
            id: asset.id,
            assetType: asset.assetType,
            metadata: asset.metadata,
            posX: asset.posX,
            posY: asset.posY,
            width: asset.width,
            height: asset.height,
            rotation: asset.rotation,
            zIndex: asset.zIndex,
          },
        ],
      }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 409) {
      // Already restored elsewhere — local state already has it, done.
      return { ok: true };
    }
    if (!res.ok) {
      // Roll back the optimistic add.
      deps.applyRemoteEvent({ type: "asset_removed", payload: { assetId: asset.id } });
      return { ok: false, reason: "network" };
    }
    // Broadcast the restoration so peers see it too.
    deps.sendEvent("asset_added", { asset });
    return { ok: true };
  } catch (e) {
    deps.applyRemoteEvent({ type: "asset_removed", payload: { assetId: asset.id } });
    return networkError(e);
  }
}

// ---------------------------------------------------------------------------
// Text / table cell / video_suggest content
// ---------------------------------------------------------------------------

/** Replace a text asset's content wholesale. */
export async function applyTextUpdate(
  deps: DesktopDispatchDeps,
  assetId: string,
  content: string
): Promise<ApplyResult> {
  if (!deps.getAssets().some((a) => a.id === assetId)) {
    return { ok: false, reason: "target_missing" };
  }
  deps.applyRemoteEvent({
    type: "asset_updated",
    payload: { assetId, metadata: { content } },
  });
  deps.sendEvent("text_updated", { assetId, content });
  try {
    const res = await fetch(`/api/desktop/${deps.desktopId}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textPatch: { content } }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/**
 * Swap an image asset's `imageId` (and the parallel `imageHistory` stack) in
 * one operation. Forward applies the new state; the inverse closure simply
 * calls this same helper with the previous values, so undo/redo cleanly walks
 * back and forth across the history.
 */
export async function applyAssetImagePatch(
  deps: DesktopDispatchDeps,
  assetId: string,
  imageId: string,
  imageHistory: string[]
): Promise<ApplyResult> {
  if (!deps.getAssets().some((a) => a.id === assetId)) {
    return { ok: false, reason: "target_missing" };
  }
  deps.applyRemoteEvent({
    type: "asset_updated",
    payload: { assetId, metadata: { imageId, imageHistory } },
  });
  deps.sendEvent("asset_image_changed", { assetId, imageId, imageHistory });
  try {
    const res = await fetch(`/api/desktop/${deps.desktopId}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagePatch: { imageId, imageHistory } }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

/** Replace a single table-asset cell value. */
export async function applyTableCellUpdate(
  deps: DesktopDispatchDeps,
  assetId: string,
  rowId: string,
  colIndex: number,
  value: string
): Promise<ApplyResult> {
  if (!deps.getAssets().some((a) => a.id === assetId)) {
    return { ok: false, reason: "target_missing" };
  }
  deps.applyRemoteEvent({
    type: "cell_updated",
    payload: { assetId, rowId, colIndex, value },
  });
  deps.sendEvent("cell_updated", { assetId, rowId, colIndex, value });
  try {
    const res = await fetch(`/api/desktop/${deps.desktopId}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cellPatch: { rowId, colIndex, value } }),
    });
    if (res.status === 403) return { ok: false, reason: "permission" };
    if (res.status === 404) return { ok: false, reason: "target_missing" };
    if (!res.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}
