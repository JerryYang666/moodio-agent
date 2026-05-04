"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getRealtimeClient,
  type ConnectionState,
  type RemoteEvent,
  type RemoteSession as ClientRemoteSession,
} from "@/lib/realtime/client";

export type { ConnectionState } from "@/lib/realtime/client";

export interface RemoteSession extends ClientRemoteSession {
  cursorX?: number;
  cursorY?: number;
  selectedAssetIds?: string[];
}

export interface ConnectedUser {
  userId: string;
  firstName: string;
  email: string;
  initial: string;
  sessionCount: number;
}

export interface RemoteCursor {
  sessionId: string;
  userId: string;
  x: number;
  y: number;
}

export type { RemoteEvent } from "@/lib/realtime/client";

interface UseDesktopWebSocketOptions {
  desktopId: string;
  enabled?: boolean;
  wsUrl?: string;
  pollingInterval?: number;
  onRemoteEvent?: (event: RemoteEvent) => void;
  fetchDetail?: () => Promise<any>;
}

const DEFAULT_POLLING_INTERVAL = 10000;

export function useDesktopWebSocket({
  desktopId,
  enabled = true,
  wsUrl,
  pollingInterval = DEFAULT_POLLING_INTERVAL,
  onRemoteEvent,
  fetchDetail,
}: UseDesktopWebSocketOptions) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Map<string, RemoteSession>>(
    () => new Map()
  );

  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRemoteEventRef = useRef(onRemoteEvent);
  const fetchDetailRef = useRef(fetchDetail);
  onRemoteEventRef.current = onRemoteEvent;
  fetchDetailRef.current = fetchDetail;

  // Manage polling fallback locally — the client reports "polling" as its
  // connection state, and we turn on a fetchDetail interval while in it.
  useEffect(() => {
    if (connectionState === "polling" && fetchDetailRef.current) {
      pollingTimer.current = setInterval(() => {
        fetchDetailRef.current?.();
      }, pollingInterval);
      return () => {
        if (pollingTimer.current) {
          clearInterval(pollingTimer.current);
          pollingTimer.current = null;
        }
      };
    }
    if (pollingTimer.current) {
      clearInterval(pollingTimer.current);
      pollingTimer.current = null;
    }
    return undefined;
  }, [connectionState, pollingInterval]);

  useEffect(() => {
    if (!enabled || !desktopId) return;

    const client = getRealtimeClient({ wsUrl });
    const topic = `desktop:${desktopId}`;

    const unsubscribe = client.subscribe(topic, {
      onConnectionState: setConnectionState,
      onRoomState: ({ mySessionId: mine, sessions: list }) => {
        setMySessionId(mine);
        const next = new Map<string, RemoteSession>();
        for (const s of list) next.set(s.sessionId, s as RemoteSession);
        setSessions(next);
      },
      onEvent: (event) => {
        if (event.type === "session_joined") {
          const info = event.payload as RemoteSession;
          setSessions((prev) => {
            const next = new Map(prev);
            next.set(info.sessionId, info);
            return next;
          });
          return;
        }
        if (event.type === "session_left") {
          const info = event.payload as { sessionId: string };
          setSessions((prev) => {
            const next = new Map(prev);
            next.delete(info.sessionId);
            return next;
          });
          onRemoteEventRef.current?.(event);
          return;
        }
        if (event.type === "cursor_move") {
          setSessions((prev) => {
            const existing = prev.get(event.sessionId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(event.sessionId, {
              ...existing,
              cursorX: event.payload?.x,
              cursorY: event.payload?.y,
            });
            return next;
          });
          return;
        }
        if (event.type === "cursor_leave") {
          setSessions((prev) => {
            const existing = prev.get(event.sessionId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(event.sessionId, {
              ...existing,
              cursorX: undefined,
              cursorY: undefined,
            });
            return next;
          });
          return;
        }
        if (event.type === "asset_selected") {
          setSessions((prev) => {
            const existing = prev.get(event.sessionId);
            if (!existing) return prev;
            const assetId = event.payload?.assetId;
            if (!assetId) return prev;
            const next = new Map(prev);
            const current = existing.selectedAssetIds || [];
            next.set(event.sessionId, {
              ...existing,
              selectedAssetIds: [...current, assetId],
            });
            return next;
          });
          return;
        }
        if (event.type === "asset_deselected") {
          setSessions((prev) => {
            const existing = prev.get(event.sessionId);
            if (!existing) return prev;
            const assetId = event.payload?.assetId;
            if (!assetId) return prev;
            const next = new Map(prev);
            next.set(event.sessionId, {
              ...existing,
              selectedAssetIds: (existing.selectedAssetIds || []).filter(
                (id: string) => id !== assetId
              ),
            });
            return next;
          });
          return;
        }
        onRemoteEventRef.current?.(event);
      },
    });

    return () => {
      unsubscribe();
      setMySessionId(null);
      setSessions(new Map());
    };
  }, [enabled, desktopId, wsUrl]);

  const sendEvent = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      if (!desktopId) return;
      const client = getRealtimeClient({ wsUrl });
      client.publish(`desktop:${desktopId}`, type, payload);
    },
    [desktopId, wsUrl]
  );

  const connectedUsers = useMemo<ConnectedUser[]>(() => {
    const userMap = new Map<
      string,
      { userId: string; firstName: string; email: string; count: number }
    >();
    Array.from(sessions.values()).forEach((s) => {
      const existing = userMap.get(s.userId);
      if (existing) {
        existing.count++;
      } else {
        userMap.set(s.userId, {
          userId: s.userId,
          firstName: s.firstName,
          email: s.email,
          count: 1,
        });
      }
    });
    return Array.from(userMap.values()).map((u) => ({
      userId: u.userId,
      firstName: u.firstName,
      email: u.email,
      initial:
        u.firstName?.charAt(0)?.toUpperCase() ||
        u.email?.charAt(0)?.toUpperCase() ||
        "?",
      sessionCount: u.count,
    }));
  }, [sessions]);

  const remoteCursors = useMemo(() => {
    const cursors: RemoteCursor[] = [];
    Array.from(sessions.values()).forEach((s) => {
      if (s.sessionId === mySessionId) return;
      if (s.cursorX != null && s.cursorY != null) {
        cursors.push({
          sessionId: s.sessionId,
          userId: s.userId,
          x: s.cursorX,
          y: s.cursorY,
        });
      }
    });
    return cursors;
  }, [sessions, mySessionId]);

  const remoteSelections = useMemo(() => {
    const selections = new Map<
      string,
      { sessionId: string; userId: string; firstName: string }[]
    >();
    Array.from(sessions.values()).forEach((s) => {
      if (s.sessionId === mySessionId) return;
      (s.selectedAssetIds || []).forEach((assetId: string) => {
        const existing = selections.get(assetId) || [];
        existing.push({
          sessionId: s.sessionId,
          userId: s.userId,
          firstName: s.firstName,
        });
        selections.set(assetId, existing);
      });
    });
    return selections;
  }, [sessions, mySessionId]);

  return {
    connectionState,
    mySessionId,
    sendEvent,
    connectedUsers,
    remoteCursors,
    remoteSelections,
    sessions,
  };
}
