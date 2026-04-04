"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { CellLock, ProductionTableWSEvent } from "@/lib/production-table/types";

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

interface UseProductionTableWSOptions {
  tableId: string;
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
const CELL_LOCK_TTL = 3000;

export function useProductionTableWS({
  tableId,
  enabled = true,
  wsUrl,
  pollingInterval = DEFAULT_POLLING_INTERVAL,
  onRemoteEvent,
  fetchDetail,
}: UseProductionTableWSOptions) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Map<string, RemoteSession>>(
    () => new Map()
  );
  const [cellLocks, setCellLocks] = useState<Map<string, CellLock>>(
    () => new Map()
  );

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalClose = useRef(false);
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

  // Expire stale cell locks
  useEffect(() => {
    const interval = setInterval(() => {
      setCellLocks((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        Array.from(next.entries()).forEach(([key, lock]) => {
          if (lock.expiresAt < now) {
            next.delete(key);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    intentionalClose.current = false;

    const url = `${baseUrl}/ws/production-table/${tableId}`;
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
          const info = data.payload as { sessionId: string; userId: string };
          setSessions((prev) => {
            const next = new Map(prev);
            next.delete(info.sessionId);
            return next;
          });
          // Clean up cell locks from the departed user
          setCellLocks((prev) => {
            let changed = false;
            const next = new Map(prev);
            Array.from(next.entries()).forEach(([key, lock]) => {
              if (lock.userId === info.userId) {
                next.delete(key);
                changed = true;
              }
            });
            return changed ? next : prev;
          });
          onRemoteEventRef.current?.(data);
          return;
        }

        // Cell lock management
        if (data.type === "pt_cell_selected") {
          const { rowId, columnId } = data.payload as {
            rowId: string;
            columnId: string;
          };
          const key = `${columnId}:${rowId}`;
          setCellLocks((prev) => {
            const next = new Map(prev);
            next.set(key, {
              userId: data.userId,
              userName: data.firstName,
              rowId,
              columnId,
              expiresAt: Date.now() + CELL_LOCK_TTL,
            });
            return next;
          });
          return;
        }

        if (data.type === "pt_cell_deselected") {
          const { rowId, columnId } = data.payload as {
            rowId: string;
            columnId: string;
          };
          const key = `${columnId}:${rowId}`;
          setCellLocks((prev) => {
            const next = new Map(prev);
            next.delete(key);
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
      if (intentionalClose.current) return;
      if (reconnectAttempts.current >= MAX_RECONNECT_BEFORE_POLLING) {
        setConnectionState("polling");
        startPolling();
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
  }, [baseUrl, tableId, startPolling, stopPolling]);

  useEffect(() => {
    if (!enabled || !tableId) return;
    connect();
    return () => {
      intentionalClose.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopPolling();
      wsRef.current?.close();
      wsRef.current = null;
      setConnectionState("disconnected");
      setMySessionId(null);
      setSessions(new Map());
      setCellLocks(new Map());
    };
  }, [enabled, tableId, connect, stopPolling]);

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
    for (const s of Array.from(sessions.values())) {
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
    }
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

  return {
    connectionState,
    mySessionId,
    sendEvent,
    connectedUsers,
    sessions,
    cellLocks,
  };
}
