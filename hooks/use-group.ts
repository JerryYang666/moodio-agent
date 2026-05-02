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

/**
 * Window-level event used to keep multiple useGroup / useGroupSummary
 * instances in the same tab in sync (e.g. desktop GroupAsset + a
 * GroupDetailDrawer pinned to the same folder). Cross-tab / cross-user sync
 * goes through the WS sendEvent that the consumer wires in.
 */
export const GROUP_MUTATED_EVENT = "moodio:group-mutated";

export interface GroupMutatedDetail {
  folderId: string;
}

export type WSSendEvent = (
  type: string,
  payload: Record<string, unknown>
) => void;

interface UseGroupOptions {
  /**
   * Broadcast to the realtime channel when a mutation happens locally so
   * other clients in the same room (desktop or production-table) refresh.
   */
  sendEvent?: WSSendEvent;
  /**
   * WS event type emitted on local mutation.
   * Desktop: "group_mutated". Production-table: "pt_group_mutated".
   */
  broadcastEventType?: string;
}

export interface AddMemberPayload {
  imageId: string;
  assetId: string;
  assetType: "image" | "video" | "public_image" | "public_video";
  thumbnailImageId?: string;
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
  addMember: (payload: AddMemberPayload) => Promise<void>;
  /**
   * Mark the group as locally mutated. Broadcasts to the channel and
   * triggers same-tab listeners. Use this after server-side actions whose
   * result lives on a different endpoint (e.g. kicking off a video gen
   * with `targetFolderId` via /api/video/generate).
   */
  notifyMutation: () => void;
}

function dispatchGroupMutated(folderId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<GroupMutatedDetail>(GROUP_MUTATED_EVENT, {
      detail: { folderId },
    })
  );
}

/**
 * Fetches a group folder + its members and exposes mutation helpers.
 * Mutations are broadcast on the configured WS channel and via a
 * window-level CustomEvent so peer instances in any other component
 * (e.g. another open drawer) refresh in real time.
 */
export function useGroup(
  folderId: string | null,
  opts: UseGroupOptions = {}
): UseGroupResult {
  const { sendEvent, broadcastEventType = "group_mutated" } = opts;
  const [data, setData] = useState<GroupData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folderIdRef = useRef(folderId);
  folderIdRef.current = folderId;
  const sendEventRef = useRef(sendEvent);
  sendEventRef.current = sendEvent;
  const broadcastTypeRef = useRef(broadcastEventType);
  broadcastTypeRef.current = broadcastEventType;

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

  // Listen for cross-component group-mutated events in the same tab.
  // The peer instance (or the page-level WS handler) dispatches this when
  // remote or local mutations land.
  useEffect(() => {
    if (!folderId) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<GroupMutatedDetail>).detail;
      if (detail?.folderId === folderId) {
        fetchGroup();
      }
    };
    window.addEventListener(GROUP_MUTATED_EVENT, handler);
    return () => window.removeEventListener(GROUP_MUTATED_EVENT, handler);
  }, [folderId, fetchGroup]);

  const notifyMutation = useCallback(() => {
    const id = folderIdRef.current;
    if (!id) return;
    dispatchGroupMutated(id);
    sendEventRef.current?.(broadcastTypeRef.current, { folderId: id });
  }, []);

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
      notifyMutation();
    },
    [folderId, fetchGroup, notifyMutation]
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
      notifyMutation();
    },
    [folderId, fetchGroup, notifyMutation]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!folderId) return;
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
      notifyMutation();
    },
    [folderId, fetchGroup, notifyMutation]
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
      notifyMutation();
      return json.image as GroupMemberData;
    },
    [folderId, fetchGroup, notifyMutation]
  );

  const addMember = useCallback(
    async (payload: AddMemberPayload) => {
      if (!folderId) return;
      const res = await fetch(`/api/folders/${folderId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: payload.imageId,
          assetId: payload.assetId,
          assetType: payload.assetType,
          generationDetails: { title: "", prompt: "", status: "generated" },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      await fetchGroup();
      notifyMutation();
    },
    [folderId, fetchGroup, notifyMutation]
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
    addMember,
    notifyMutation,
  };
}
