"use client";

import { useState, useCallback } from "react";
import type { DesktopAsset } from "@/lib/db/schema";

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
    permission: string;
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
                a.id === assetId ? data.asset : a
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
              assets: prev.assets.map((a) => updatedMap.get(a.id) || a),
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
  };
}

export type { CameraState, DesktopSummary, DesktopDetail };
