"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { CellLock, RemoteCellCursor } from "@/lib/production-table/types";
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
}

export type { RemoteEvent } from "@/lib/realtime/client";

interface UseProductionTableWSOptions {
  tableId: string;
  enabled?: boolean;
  wsUrl?: string;
  pollingInterval?: number;
  onRemoteEvent?: (event: RemoteEvent) => void;
  fetchDetail?: () => Promise<any>;
}

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

  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRemoteEventRef = useRef(onRemoteEvent);
  const fetchDetailRef = useRef(fetchDetail);
  onRemoteEventRef.current = onRemoteEvent;
  fetchDetailRef.current = fetchDetail;

  // Expire stale cell locks.
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

  // Polling fallback mirrors the desktop hook.
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
    if (!enabled || !tableId) return;

    const client = getRealtimeClient({ wsUrl });
    const topic = `production-table:${tableId}`;

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
          const info = event.payload as { sessionId: string; userId: string };
          setSessions((prev) => {
            const next = new Map(prev);
            next.delete(info.sessionId);
            return next;
          });
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
          onRemoteEventRef.current?.(event);
          return;
        }
        if (event.type === "pt_cell_selected") {
          const { rowId, columnId } = event.payload as {
            rowId: string;
            columnId: string;
          };
          const key = `${columnId}:${rowId}`;
          setCellLocks((prev) => {
            const next = new Map(prev);
            next.set(key, {
              userId: event.userId,
              userName: event.firstName,
              rowId,
              columnId,
              expiresAt: Date.now() + CELL_LOCK_TTL,
            });
            return next;
          });
          return;
        }
        if (event.type === "pt_cell_deselected") {
          const { rowId, columnId } = event.payload as {
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
        if (event.type === "pt_cursor_move") {
          const { x, y } = event.payload as { x: number; y: number };
          setSessions((prev) => {
            const existing = prev.get(event.sessionId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(event.sessionId, {
              ...existing,
              cursorX: x,
              cursorY: y,
            });
            return next;
          });
          return;
        }
        if (event.type === "pt_cursor_leave") {
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
        onRemoteEventRef.current?.(event);
      },
    });

    return () => {
      unsubscribe();
      setMySessionId(null);
      setSessions(new Map());
      setCellLocks(new Map());
    };
  }, [enabled, tableId, wsUrl]);

  const sendEvent = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      if (!tableId) return;
      const client = getRealtimeClient({ wsUrl });
      client.publish(`production-table:${tableId}`, type, payload);
    },
    [tableId, wsUrl]
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

  const remoteCursors = useMemo((): RemoteCellCursor[] => {
    const cursors: RemoteCellCursor[] = [];
    for (const s of Array.from(sessions.values())) {
      if (s.sessionId === mySessionId) continue;
      if (s.cursorX != null && s.cursorY != null) {
        cursors.push({
          sessionId: s.sessionId,
          userId: s.userId,
          userName: s.firstName,
          x: s.cursorX,
          y: s.cursorY,
        });
      }
    }
    return cursors;
  }, [sessions, mySessionId]);

  return {
    connectionState,
    mySessionId,
    sendEvent,
    connectedUsers,
    sessions,
    cellLocks,
    remoteCursors,
  };
}
