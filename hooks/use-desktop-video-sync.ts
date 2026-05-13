"use client";

import { useEffect, useRef, useCallback } from "react";
import { useVideo, type VideoGeneration } from "@/components/video-provider";
import type { VideoAssetMeta } from "@/lib/desktop/types";
import type { RemoteEvent } from "@/hooks/use-desktop-ws";

const POLL_INTERVAL = 5000;
const NEWCOMER_GRACE_PERIOD = 6000;
const HEARTBEAT_STALE_MS = POLL_INTERVAL * 3;

interface PendingGeneration {
  generationId: string;
  assetId: string;
}

interface UseDesktopVideoSyncOptions {
  assets: Array<{ id: string; assetType: string; metadata: unknown; generationData?: any }>;
  sendEvent: (type: string, payload: Record<string, unknown>) => void;
  fetchDetail: () => Promise<any>;
}

/**
 * Coordinates video-generation polling across all users in a desktop room.
 *
 * - The client that initiated the generation (or the first to detect it) polls
 *   and broadcasts `video_generation_polling` heartbeats so others don't.
 * - When a generation completes/fails the poller broadcasts
 *   `video_generation_updated` so every client updates instantly.
 * - A newcomer waits NEWCOMER_GRACE_PERIOD ms before polling. If it receives a
 *   heartbeat for a generation during that window, it yields to the existing poller.
 */
export function useDesktopVideoSync({
  assets,
  sendEvent,
  fetchDetail,
}: UseDesktopVideoSyncOptions) {
  const { monitorGeneration, onGenerationUpdate, generationStatuses } = useVideo();

  // Track which generations *we* are the designated poller for
  const ownedPollingRef = useRef<Set<string>>(new Set());
  // Track which generations some *other* client is polling
  const remotePollingRef = useRef<Map<string, number>>(new Map());
  // Track newcomer grace period
  const mountedAtRef = useRef(Date.now());
  // Refs to avoid stale closures
  const sendEventRef = useRef(sendEvent);
  const fetchDetailRef = useRef(fetchDetail);
  sendEventRef.current = sendEvent;
  fetchDetailRef.current = fetchDetail;

  // ---------------------------------------------------------------
  // 1. Discover pending generations from assets & start polling
  //    if we should be the designated poller.
  // ---------------------------------------------------------------
  const pendingGens = useRef<PendingGeneration[]>([]);

  useEffect(() => {
    const pending: PendingGeneration[] = [];
    for (const asset of assets) {
      if (asset.assetType !== "video") continue;
      const meta = asset.metadata as unknown as VideoAssetMeta;
      const genId = meta.generationId;
      if (!genId) continue;

      // Check all status sources: live cache, enriched API data, and metadata
      const liveStatus = generationStatuses[genId];
      const status = liveStatus || asset.generationData?.status || meta.status;
      if (status === "completed" || status === "failed") continue;
      if (status === "pending" || status === "processing") {
        pending.push({ generationId: genId, assetId: asset.id });
      }
    }
    pendingGens.current = pending;

    // Claim polling for any generation not already handled
    for (const { generationId } of pending) {
      if (ownedPollingRef.current.has(generationId)) continue;

      const lastHeartbeat = remotePollingRef.current.get(generationId);
      const someoneElsePolling =
        lastHeartbeat !== undefined &&
        Date.now() - lastHeartbeat < HEARTBEAT_STALE_MS;
      if (someoneElsePolling) continue;

      const isNewcomer =
        Date.now() - mountedAtRef.current < NEWCOMER_GRACE_PERIOD;
      if (isNewcomer) continue;

      ownedPollingRef.current.add(generationId);
      monitorGeneration(generationId);
    }
  }, [assets, monitorGeneration, generationStatuses]);

  // ---------------------------------------------------------------
  // 2. Heartbeat: while we are polling a generation, broadcast that
  //    fact to the room so newcomers know not to duplicate.
  // ---------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      const owned = ownedPollingRef.current;
      if (owned.size === 0) return;
      for (const generationId of Array.from(owned)) {
        sendEventRef.current("video_generation_polling", { generationId });
      }
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------------
  // 3. When a generation completes/fails, broadcast the result and
  //    refresh the desktop so the asset updates.
  // ---------------------------------------------------------------
  useEffect(() => {
    return onGenerationUpdate((generationId: string, gen: VideoGeneration) => {
      ownedPollingRef.current.delete(generationId);
      remotePollingRef.current.delete(generationId);

      if (gen.status === "completed" || gen.status === "failed") {
        sendEventRef.current("video_generation_updated", {
          generationId,
          status: gen.status,
        });
        fetchDetailRef.current();
      }
    });
  }, [onGenerationUpdate]);

  // ---------------------------------------------------------------
  // 4. Newcomer grace: for the first NEWCOMER_GRACE_PERIOD ms, delay
  //    polling start so we can listen for heartbeats.
  // ---------------------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      // Grace period expired — if any pending generations still have no
      // active remote poller, claim them.
      for (const { generationId } of pendingGens.current) {
        if (ownedPollingRef.current.has(generationId)) continue;
        const lastHeartbeat = remotePollingRef.current.get(generationId);
        const someoneElsePolling =
          lastHeartbeat !== undefined &&
          Date.now() - lastHeartbeat < HEARTBEAT_STALE_MS;
        if (someoneElsePolling) continue;

        ownedPollingRef.current.add(generationId);
        monitorGeneration(generationId);
      }
    }, NEWCOMER_GRACE_PERIOD);
    return () => clearTimeout(timer);
    // Only runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------
  // 5. Handle incoming remote events from the WebSocket
  // ---------------------------------------------------------------
  const handleVideoRemoteEvent = useCallback(
    (event: RemoteEvent) => {
      if (event.type === "video_generation_polling") {
        const { generationId } = event.payload || {};
        if (!generationId) return;
        // Record that someone else is polling this generation
        remotePollingRef.current.set(generationId, Date.now());
      }

      if (event.type === "video_generation_updated") {
        const { generationId, status } = event.payload || {};
        if (!generationId) return;
        remotePollingRef.current.delete(generationId);
        ownedPollingRef.current.delete(generationId);

        // The remote client already fetched the latest — we just need to
        // refresh our own desktop state to pick up the updated asset.
        fetchDetailRef.current();
      }
    },
    []
  );

  return { handleVideoRemoteEvent, generationStatuses };
}
