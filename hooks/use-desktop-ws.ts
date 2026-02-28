"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "polling"
  | "disconnected";

export interface RemoteSession {
  sessionId: string;
  userId: string;
  firstName: string;
  email: string;
  permission: string;
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

export interface RemoteEvent {
  type: string;
  sessionId: string;
  userId: string;
  firstName: string;
  email: string;
  timestamp: number;
  payload: any;
}

interface UseDesktopWebSocketOptions {
  desktopId: string;
  enabled?: boolean;
  wsUrl?: string;
  pollingInterval?: number;
  onRemoteEvent?: (event: RemoteEvent) => void;
  fetchDetail?: () => Promise<any>;
}

const WS_BASE_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_WS_URL || `ws://${window.location.hostname}:8081`
    : "";

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const MAX_RECONNECT_BEFORE_POLLING = 5;
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

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRemoteEventRef = useRef(onRemoteEvent);
  const fetchDetailRef = useRef(fetchDetail);

  onRemoteEventRef.current = onRemoteEvent;
  fetchDetailRef.current = fetchDetail;

  const baseUrl = wsUrl || WS_BASE_URL;

  const stopPolling = useCallback(() => {
    if (pollingTimer.current) {
      clearInterval(pollingTimer.current);
      pollingTimer.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    if (!fetchDetailRef.current) return;
    pollingTimer.current = setInterval(() => {
      fetchDetailRef.current?.();
    }, pollingInterval);
  }, [pollingInterval, stopPolling]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const url = `${baseUrl}/ws/desktop/${desktopId}`;
    setConnectionState(
      reconnectAttempts.current > 0 ? "reconnecting" : "connecting"
    );

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      setConnectionState("connected");
      stopPolling();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RemoteEvent;

        if (data.type === "room_joined") {
          const payload = data as unknown as {
            type: string;
            sessionId: string;
            sessions: RemoteSession[];
          };
          setMySessionId(payload.sessionId);
          const newSessions = new Map<string, RemoteSession>();
          for (const s of payload.sessions) {
            newSessions.set(s.sessionId, s);
          }
          setSessions(newSessions);
          return;
        }

        if (data.type === "session_joined") {
          const info = data.payload as RemoteSession;
          setSessions((prev) => {
            const next = new Map(prev);
            next.set(info.sessionId, info);
            return next;
          });
          return;
        }

        if (data.type === "session_left") {
          const info = data.payload as { sessionId: string };
          setSessions((prev) => {
            const next = new Map(prev);
            next.delete(info.sessionId);
            return next;
          });
          return;
        }

        if (data.type === "cursor_move") {
          setSessions((prev) => {
            const existing = prev.get(data.sessionId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(data.sessionId, {
              ...existing,
              cursorX: data.payload?.x,
              cursorY: data.payload?.y,
            });
            return next;
          });
          return;
        }

        if (data.type === "cursor_leave") {
          setSessions((prev) => {
            const existing = prev.get(data.sessionId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(data.sessionId, {
              ...existing,
              cursorX: undefined,
              cursorY: undefined,
            });
            return next;
          });
          return;
        }

        if (data.type === "asset_selected") {
          setSessions((prev) => {
            const existing = prev.get(data.sessionId);
            if (!existing) return prev;
            const assetId = data.payload?.assetId;
            if (!assetId) return prev;
            const next = new Map(prev);
            const current = existing.selectedAssetIds || [];
            next.set(data.sessionId, {
              ...existing,
              selectedAssetIds: [...current, assetId],
            });
            return next;
          });
          return;
        }

        if (data.type === "asset_deselected") {
          setSessions((prev) => {
            const existing = prev.get(data.sessionId);
            if (!existing) return prev;
            const assetId = data.payload?.assetId;
            if (!assetId) return prev;
            const next = new Map(prev);
            next.set(data.sessionId, {
              ...existing,
              selectedAssetIds: (existing.selectedAssetIds || []).filter(
                (id: string) => id !== assetId
              ),
            });
            return next;
          });
          return;
        }

        onRemoteEventRef.current?.(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (reconnectAttempts.current >= MAX_RECONNECT_BEFORE_POLLING) {
        setConnectionState("polling");
        startPolling();
        // Still try to reconnect periodically
        reconnectTimer.current = setTimeout(() => {
          reconnectAttempts.current = 0;
          connect();
        }, RECONNECT_MAX_DELAY);
        return;
      }
      setConnectionState("reconnecting");
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current),
        RECONNECT_MAX_DELAY
      );
      reconnectAttempts.current++;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [baseUrl, desktopId, startPolling, stopPolling]);

  useEffect(() => {
    if (!enabled || !desktopId) return;
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopPolling();
      wsRef.current?.close();
      wsRef.current = null;
      setConnectionState("disconnected");
      setMySessionId(null);
      setSessions(new Map());
    };
  }, [enabled, desktopId, connect, stopPolling]);

  const sendEvent = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type, payload }));
    },
    []
  );

  const connectedUsers = useMemo(() => {
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
