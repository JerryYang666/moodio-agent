"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GROUP_MUTATED_EVENT,
  type GroupMutatedDetail,
} from "@/hooks/use-group";

export interface GroupSummary {
  folderId: string;
  name: string;
  modality: "image" | "video";
  coverCollectionImageId: string | null;
  coverImageId: string | null;
  coverImageUrl: string | null;
  coverThumbnailSmUrl: string | null;
  memberCount: number;
}

/**
 * Lightweight summary fetch (cover thumbnail + member count) used by
 * MediaCell and other compact previews. Auto-refreshes when a same-tab
 * `moodio:group-mutated` event fires for this folderId — which is
 * triggered both by local mutations (via useGroup) and by the
 * desktop / production-table page's WS event handler when a remote peer
 * mutates the group.
 */
export function useGroupSummary(folderId: string | null) {
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!folderId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/summary`);
      if (!res.ok) {
        setSummary(null);
        return;
      }
      const json = (await res.json()) as GroupSummary;
      setSummary(json);
    } catch {
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    if (folderId) fetchSummary();
    else setSummary(null);
  }, [folderId, fetchSummary]);

  useEffect(() => {
    if (!folderId) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<GroupMutatedDetail>).detail;
      if (detail?.folderId === folderId) {
        fetchSummary();
      }
    };
    window.addEventListener(GROUP_MUTATED_EVENT, handler);
    return () => window.removeEventListener(GROUP_MUTATED_EVENT, handler);
  }, [folderId, fetchSummary]);

  return { summary, isLoading, refresh: fetchSummary };
}
