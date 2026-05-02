"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GroupMemberData {
  id: string; // collection_images.id
  imageId: string;
  assetId: string;
  assetType: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailSmUrl?: string | null;
  thumbnailMdUrl?: string | null;
  groupStatus: "candidate" | "good" | "final" | null;
  generationDetails: Record<string, unknown>;
  prompt?: string;
}

export interface GroupData {
  folderId: string;
  name: string;
  modality: "image" | "video";
  coverImageId: string | null; // collection_images.id of the cover row
  defaultGenerationConfig: Record<string, unknown>;
  members: GroupMemberData[];
  permission: string | null;
}

interface UseGroupResult {
  data: GroupData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setMemberStatus: (
    memberId: string,
    status: "candidate" | "good" | "final" | null
  ) => Promise<void>;
  setCover: (memberId: string | null) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  /** Image-group only. Returns the new member row. */
  generateImage: (
    config: Record<string, unknown>,
    copyFromImageId?: string
  ) => Promise<GroupMemberData>;
}

/**
 * Fetches a group folder + its members. The server endpoint is the existing
 * `GET /api/folders/[folderId]` — we just shape the response locally.
 *
 * Mutations call the new group endpoints and refresh state on success.
 */
export function useGroup(folderId: string | null): UseGroupResult {
  const [data, setData] = useState<GroupData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folderIdRef = useRef(folderId);
  folderIdRef.current = folderId;

  const fetchGroup = useCallback(async () => {
    if (!folderIdRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folderIdRef.current}`);
      if (!res.ok) throw new Error(`Failed to fetch group (${res.status})`);
      const json = await res.json();
      const folder = json.folder;
      if (!folder) {
        setData(null);
        return;
      }
      const members: GroupMemberData[] = (json.images || []).map(
        (a: Record<string, unknown>) => ({
          id: a.id as string,
          imageId: a.imageId as string,
          assetId: a.assetId as string,
          assetType: a.assetType as string,
          imageUrl: (a.imageUrl as string | undefined) ?? null,
          videoUrl: (a.videoUrl as string | undefined) ?? null,
          thumbnailSmUrl: (a.thumbnailSmUrl as string | undefined) ?? null,
          thumbnailMdUrl: (a.thumbnailMdUrl as string | undefined) ?? null,
          groupStatus:
            (a.groupStatus as GroupMemberData["groupStatus"]) ?? null,
          generationDetails:
            (a.generationDetails as Record<string, unknown>) || {},
          prompt:
            typeof (a.generationDetails as Record<string, unknown>)?.prompt ===
            "string"
              ? ((a.generationDetails as Record<string, unknown>)
                  .prompt as string)
              : undefined,
        })
      );
      setData({
        folderId: folder.id,
        name: folder.name,
        modality: folder.modality,
        coverImageId: folder.coverImageId ?? null,
        defaultGenerationConfig:
          (folder.defaultGenerationConfig as Record<string, unknown>) || {},
        members,
        permission: folder.permission ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load group");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (folderId) {
      fetchGroup();
    } else {
      setData(null);
    }
  }, [folderId, fetchGroup]);

  const setMemberStatus = useCallback(
    async (
      memberId: string,
      status: "candidate" | "good" | "final" | null
    ) => {
      if (!folderId) return;
      const res = await fetch(
        `/api/folders/${folderId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      await fetchGroup();
    },
    [folderId, fetchGroup]
  );

  const setCover = useCallback(
    async (memberId: string | null) => {
      if (!folderId) return;
      const res = await fetch(`/api/folders/${folderId}/cover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionImageId: memberId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      await fetchGroup();
    },
    [folderId, fetchGroup]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!folderId || !data) return;
      // Use the bulk endpoint to delete a single item.
      const res = await fetch(`/api/folders/${folderId}/images/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [memberId], action: "delete" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      await fetchGroup();
    },
    [folderId, data, fetchGroup]
  );

  const generateImage = useCallback(
    async (config: Record<string, unknown>, copyFromImageId?: string) => {
      if (!folderId) throw new Error("No folder selected");
      const res = await fetch(`/api/folders/${folderId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, copyFromImageId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      const json = await res.json();
      await fetchGroup();
      return json.image as GroupMemberData;
    },
    [folderId, fetchGroup]
  );

  return {
    data,
    isLoading,
    error,
    refresh: fetchGroup,
    setMemberStatus,
    setCover,
    removeMember,
    generateImage,
  };
}
