"use client";

import { useState, useCallback } from "react";
import type { DesktopAsset } from "@/lib/db/schema";
import { type SharePermission } from "@/lib/permissions";

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

interface DesktopSummary {
  id: string;
  userId: string;
  name: string;
  viewportState: CameraState | null;
  permission: string;
  isOwner: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface DesktopDetail {
  desktop: DesktopSummary;
  assets: DesktopAsset[];
  shares: Array<{
    id: string;
    desktopId: string;
    sharedWithUserId: string;
    permission: SharePermission;
    sharedAt: Date;
    email: string;
  }>;
}

export function useDesktops() {
  const [desktops, setDesktops] = useState<DesktopSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDesktops = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/desktop");
      if (!res.ok) throw new Error("Failed to fetch desktops");
      const data = await res.json();
      setDesktops(data.desktops);
      return data.desktops as DesktopSummary[];
    } catch (error) {
      console.error("Error fetching desktops:", error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createDesktop = useCallback(async (name: string) => {
    const res = await fetch("/api/desktop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to create desktop");
    const data = await res.json();
    setDesktops((prev) => [data.desktop, ...prev]);
    return data.desktop as DesktopSummary;
  }, []);

  const deleteDesktop = useCallback(async (id: string) => {
    const res = await fetch(`/api/desktop/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete desktop");
    setDesktops((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const renameDesktop = useCallback(async (id: string, name: string) => {
    const res = await fetch(`/api/desktop/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to rename desktop");
    const data = await res.json();
    setDesktops((prev) =>
      prev.map((d) => (d.id === id ? data.desktop : d))
    );
    return data.desktop as DesktopSummary;
  }, []);

  return { desktops, loading, fetchDesktops, createDesktop, deleteDesktop, renameDesktop };
}

/**
 * Merge a server-returned asset into the local one, preserving locally
 * enriched fields (videoUrl, generationData, imageUrl) that the server
 * doesn't always return (e.g. PATCH responses lack the videoGenerations join).
 */
function mergeAsset<T extends DesktopAsset>(local: T, server: DesktopAsset): T {
  const merged = { ...local, ...server } as T;
  const s = server as Record<string, unknown>;
  const l = local as Record<string, unknown>;
  if (s.videoUrl == null && l.videoUrl != null) (merged as Record<string, unknown>).videoUrl = l.videoUrl;
  if (s.generationData == null && l.generationData != null) (merged as Record<string, unknown>).generationData = l.generationData;
  if (s.imageUrl == null && l.imageUrl != null) (merged as Record<string, unknown>).imageUrl = l.imageUrl;
  return merged;
}

export function useDesktopDetail(desktopId: string) {
  const [detail, setDetail] = useState<DesktopDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/desktop/${desktopId}`);
      if (!res.ok) throw new Error("Failed to fetch desktop");
      const data: DesktopDetail = await res.json();
      setDetail(data);
      return data;
    } catch (error) {
      console.error("Error fetching desktop detail:", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [desktopId]);

  const addAssets = useCallback(
    async (
      assets: Array<{
        assetType: string;
        metadata: Record<string, unknown>;
        posX: number;
        posY: number;
        width?: number;
        height?: number;
      }>
    ) => {
      const res = await fetch(`/api/desktop/${desktopId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets }),
      });
      if (!res.ok) throw new Error("Failed to add assets");
      const data = await res.json();
      setDetail((prev) =>
        prev
          ? { ...prev, assets: [...data.assets, ...prev.assets] }
          : null
      );
      return data.assets as DesktopAsset[];
    },
    [desktopId]
  );

  const updateAsset = useCallback(
    async (assetId: string, updates: Record<string, unknown>) => {
      // Optimistic update: apply changes immediately so there's no visual snap-back
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              assets: prev.assets.map((a) =>
                a.id === assetId ? { ...a, ...updates } : a
              ),
            }
          : null
      );

      const res = await fetch(`/api/desktop/${desktopId}/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update asset");
      const data = await res.json();
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              assets: prev.assets.map((a) =>
                a.id === assetId ? mergeAsset(a, data.asset) : a
              ),
            }
          : null
      );
      return data.asset as DesktopAsset;
    },
    [desktopId]
  );

  const removeAsset = useCallback(
    async (assetId: string) => {
      const res = await fetch(`/api/desktop/${desktopId}/assets/${assetId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete asset");
      setDetail((prev) =>
        prev
          ? { ...prev, assets: prev.assets.filter((a) => a.id !== assetId) }
          : null
      );
    },
    [desktopId]
  );

  const batchUpdateAssets = useCallback(
    async (
      updates: Array<{
        id: string;
        posX?: number;
        posY?: number;
        width?: number | null;
        height?: number | null;
        zIndex?: number;
      }>
    ) => {
      // Optimistic update
      const updateMap = new Map(updates.map((u) => [u.id, u]));
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              assets: prev.assets.map((a) => {
                const u = updateMap.get(a.id);
                return u ? { ...a, ...u } : a;
              }),
            }
          : null
      );

      const res = await fetch(`/api/desktop/${desktopId}/assets/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error("Failed to batch update assets");
      const data = await res.json();
      const updatedMap = new Map(
        (data.assets as DesktopAsset[]).map((a) => [a.id, a])
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              assets: prev.assets.map((a) => {
                const server = updatedMap.get(a.id);
                return server ? mergeAsset(a, server) : a;
              }),
            }
          : null
      );
      return data.assets as DesktopAsset[];
    },
    [desktopId]
  );

  const saveViewport = useCallback(
    async (viewportState: CameraState) => {
      await fetch(`/api/desktop/${desktopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewportState }),
      });
    },
    [desktopId]
  );

  const applyRemoteEvent = useCallback(
    (event: { type: string; payload: any }) => {
      switch (event.type) {
        case "asset_moved":
        case "asset_dragging": {
          const { assetId, posX, posY } = event.payload || {};
          if (!assetId) return;
          setDetail((prev) =>
            prev
              ? {
                  ...prev,
                  assets: prev.assets.map((a) =>
                    a.id === assetId ? { ...a, posX, posY } : a
                  ),
                }
              : null
          );
          break;
        }
        case "asset_resized":
        case "asset_resizing": {
          const { assetId, width, height, posX, posY } = event.payload || {};
          if (!assetId) return;
          const updates: Record<string, unknown> = { width, height };
          if (posX != null) updates.posX = posX;
          if (posY != null) updates.posY = posY;
          setDetail((prev) =>
            prev
              ? {
                  ...prev,
                  assets: prev.assets.map((a) =>
                    a.id === assetId ? { ...a, ...updates } : a
                  ),
                }
              : null
          );
          break;
        }
        case "asset_added": {
          const asset = event.payload?.asset;
          if (!asset) return;
          setDetail((prev) =>
            prev
              ? {
                  ...prev,
                  assets: [asset, ...prev.assets.filter((a) =>
                    a.id !== asset.id &&
                    !(asset.assetType === "table" && a.id === "__generating_table__")
                  )],
                }
              : null
          );
          break;
        }
        case "asset_removed": {
          const { assetId } = event.payload || {};
          if (!assetId) return;
          setDetail((prev) =>
            prev
              ? { ...prev, assets: prev.assets.filter((a) => a.id !== assetId) }
              : null
          );
          break;
        }
        case "cell_updated": {
          const { assetId, rowId, colIndex, value } = event.payload || {};
          if (!assetId || !rowId || colIndex == null) return;
          setDetail((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              assets: prev.assets.map((a) => {
                if (a.id !== assetId || a.assetType !== "table") return a;
                const meta = a.metadata as Record<string, unknown>;
                const rows = Array.isArray(meta.rows) ? [...meta.rows] : [];
                const rowIndex = rows.findIndex((r: any) => r.id === rowId);
                if (rowIndex === -1) return a;
                const row = { ...rows[rowIndex] } as any;
                const cells = Array.isArray(row.cells) ? [...row.cells] : [];
                if (colIndex < 0 || colIndex >= cells.length) return a;
                cells[colIndex] = { ...cells[colIndex], value };
                row.cells = cells;
                rows[rowIndex] = row;
                return { ...a, metadata: { ...meta, rows } };
              }),
            };
          });
          break;
        }
      }
    },
    []
  );

  const mergeRemoteState = useCallback(
    (serverDetail: DesktopDetail, draggingAssetIds?: Set<string>) => {
      setDetail((prev) => {
        if (!prev) return serverDetail;
        const serverMap = new Map(
          serverDetail.assets.map((a) => [a.id, a])
        );
        const mergedAssets = serverDetail.assets.map((serverAsset) => {
          if (draggingAssetIds?.has(serverAsset.id)) {
            const local = prev.assets.find((a) => a.id === serverAsset.id);
            return local || serverAsset;
          }
          return serverAsset;
        });
        return {
          ...serverDetail,
          assets: mergedAssets,
        };
      });
    },
    []
  );

  return {
    detail,
    setDetail,
    loading,
    fetchDetail,
    addAssets,
    updateAsset,
    removeAsset,
    batchUpdateAssets,
    saveViewport,
    applyRemoteEvent,
    mergeRemoteState,
  };
}

export type { CameraState, DesktopSummary, DesktopDetail };
