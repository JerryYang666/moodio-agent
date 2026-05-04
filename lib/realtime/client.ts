"use client";

// RealtimeClient is a singleton connection manager that owns ONE WebSocket
// to the Go relay and multiplexes many topic subscriptions over it. Hooks
// (useDesktopWebSocket, useProductionTableWS) are thin wrappers that
// subscribe/unsubscribe and receive events via callbacks.
//
// Connection lifecycle:
//   - Lazy connect on first subscribe.
//   - Auto-close on last unsubscribe.
//   - On close with active subs: exponential backoff reconnect; after
//     MAX_RECONNECT_BEFORE_POLLING attempts, surface state "polling" so hooks
//     can fall back to REST polling; still keep retrying in the background.

export type RealtimePermission = "owner" | "editor" | "viewer";

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

export interface RoomState {
  mySessionId: string;
  permission: RealtimePermission;
  sessions: RemoteSession[];
}

export interface TopicError {
  code: string;
  message: string;
}

export interface TopicHandlers {
  onEvent?: (event: RemoteEvent) => void;
  onRoomState?: (state: RoomState) => void;
  onConnectionState?: (state: ConnectionState) => void;
  onError?: (err: TopicError) => void;
}

export interface RealtimeClient {
  subscribe(topic: string, handlers: TopicHandlers): () => void;
  publish(
    topic: string,
    type: string,
    payload: Record<string, unknown>
  ): void;
  getConnectionState(): ConnectionState;
}

// Shared constants formerly duplicated across hooks.
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const MAX_RECONNECT_BEFORE_POLLING = 5;

type WireIncoming =
  | {
      op: "subscribed";
      topic: string;
      permission: RealtimePermission;
      sessionId: string;
      sessions: RemoteSession[];
      ref?: string;
    }
  | { op: "unsubscribed"; topic: string; ref?: string }
  | {
      op: "error";
      topic?: string;
      code: string;
      message?: string;
      ref?: string;
    }
  | {
      op: "event";
      topic: string;
      type: string;
      sessionId: string;
      userId: string;
      firstName: string;
      email: string;
      timestamp: number;
      payload: any;
    };

interface Subscription {
  topic: string;
  handlers: Set<TopicHandlers>;
  permission?: RealtimePermission;
  mySessionId?: string;
  sessions: RemoteSession[];
  // Set to true once we receive a forbidden error; client stops re-trying on
  // reconnect until unsubscribe+subscribe is called again.
  forbidden?: boolean;
  // Correlates outstanding subscribe to its ack.
  pendingRef?: string;
  // Last per-topic state we handed to handlers, so we can suppress no-op
  // broadcasts.
  lastState?: ConnectionState;
}

function defaultWsUrl(): string {
  if (typeof window === "undefined") return "";
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  return envUrl ?? `ws://${window.location.hostname}:8081`;
}

let singleton: RealtimeClient | null = null;
let singletonKey = "";

export function getRealtimeClient(opts?: { wsUrl?: string }): RealtimeClient {
  const key = opts?.wsUrl ?? defaultWsUrl();
  if (singleton && key === singletonKey) return singleton;
  singleton = createRealtimeClient(key);
  singletonKey = key;
  return singleton;
}

// Exposed for tests only.
export function resetRealtimeClientForTests(): void {
  singleton = null;
  singletonKey = "";
}

function createRealtimeClient(wsUrl: string): RealtimeClient {
  const base = wsUrl.replace(/\/$/, "");
  // Under /ws/ so existing Nginx `location /ws/` blocks route it to the
  // realtime upstream without changes.
  const endpoint = `${base}/ws/connection`;

  const subs = new Map<string, Subscription>();

  let ws: WebSocket | null = null;
  let connectionState: ConnectionState = "disconnected";
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;
  let refSeq = 0;

  function nextRef(): string {
    refSeq = (refSeq + 1) | 0;
    return `c${refSeq}`;
  }

  function totalHandlers(): number {
    let n = 0;
    subs.forEach((s) => {
      n += s.handlers.size;
    });
    return n;
  }

  // Transport-level state reflects the socket itself; per-topic state also
  // reflects subscribe/ack/forbidden. A topic only reports "connected" after
  // the subscribed ack arrives. A forbidden topic reports "disconnected" (no
  // retry). Anything else tracks the socket.
  function topicStateFor(sub: Subscription): ConnectionState {
    if (sub.forbidden) return "disconnected";
    if (
      connectionState === "disconnected" ||
      connectionState === "reconnecting" ||
      connectionState === "polling" ||
      connectionState === "connecting"
    ) {
      return connectionState;
    }
    // socket open — only "connected" once we've received the ack.
    return sub.permission ? "connected" : "connecting";
  }

  function notifySubState(sub: Subscription) {
    const next = topicStateFor(sub);
    if (sub.lastState === next) return;
    sub.lastState = next;
    sub.handlers.forEach((h) => h.onConnectionState?.(next));
  }

  function broadcastConnectionState(next: ConnectionState) {
    const changed = connectionState !== next;
    connectionState = next;
    // If the socket drops or enters a non-open state, any acked subs need to
    // forget their ack so they don't flash back to "connected" on reconnect
    // before the resubscribe ack arrives.
    if (next !== "connected") {
      subs.forEach((sub) => {
        sub.permission = undefined;
        sub.mySessionId = undefined;
        sub.sessions = [];
      });
    }
    if (!changed) {
      // still push per-sub state in case an individual sub's derived state changed.
      subs.forEach(notifySubState);
      return;
    }
    subs.forEach(notifySubState);
  }

  function openSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    intentionalClose = false;
    broadcastConnectionState(
      reconnectAttempts > 0 ? "reconnecting" : "connecting"
    );
    try {
      ws = new WebSocket(endpoint);
    } catch (err) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectAttempts = 0;
      broadcastConnectionState("connected");
      // Re-subscribe every topic that isn't forbidden.
      subs.forEach((sub) => {
        if (sub.forbidden) return;
        sub.pendingRef = nextRef();
        sendSubscribe(sub.topic, sub.pendingRef);
      });
    };

    ws.onmessage = (evt) => {
      let parsed: WireIncoming;
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        return;
      }
      handleWireMessage(parsed);
    };

    ws.onclose = () => {
      ws = null;
      if (intentionalClose) {
        broadcastConnectionState("disconnected");
        return;
      }
      if (totalHandlers() === 0) {
        broadcastConnectionState("disconnected");
        return;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
  }

  function closeSocket() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
      ws = null;
    }
    broadcastConnectionState("disconnected");
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    if (reconnectAttempts >= MAX_RECONNECT_BEFORE_POLLING) {
      broadcastConnectionState("polling");
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        reconnectAttempts = 0;
        openSocket();
      }, RECONNECT_MAX_DELAY_MS);
      return;
    }
    broadcastConnectionState("reconnecting");
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts),
      RECONNECT_MAX_DELAY_MS
    );
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  }

  function wireSend(obj: Record<string, unknown>): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  function sendSubscribe(topic: string, ref: string) {
    wireSend({ op: "subscribe", topic, ref });
  }

  function sendUnsubscribe(topic: string) {
    wireSend({ op: "unsubscribe", topic, ref: nextRef() });
  }

  function handleWireMessage(msg: WireIncoming) {
    switch (msg.op) {
      case "subscribed": {
        const sub = subs.get(msg.topic);
        if (!sub) return;
        sub.pendingRef = undefined;
        sub.permission = msg.permission;
        sub.mySessionId = msg.sessionId;
        sub.sessions = msg.sessions ?? [];
        const state: RoomState = {
          mySessionId: sub.mySessionId!,
          permission: sub.permission!,
          sessions: sub.sessions,
        };
        sub.handlers.forEach((h) => h.onRoomState?.(state));
        notifySubState(sub);
        return;
      }
      case "unsubscribed":
        return;
      case "error": {
        if (msg.topic) {
          const sub = subs.get(msg.topic);
          if (sub) {
            if (msg.code === "forbidden") {
              sub.forbidden = true;
            }
            const errInfo: TopicError = {
              code: msg.code,
              message: msg.message ?? "",
            };
            sub.handlers.forEach((h) => h.onError?.(errInfo));
            notifySubState(sub);
          }
        }
        return;
      }
      case "event": {
        const sub = subs.get(msg.topic);
        if (!sub) return;
        const remote: RemoteEvent = {
          type: msg.type,
          sessionId: msg.sessionId,
          userId: msg.userId,
          firstName: msg.firstName,
          email: msg.email,
          timestamp: msg.timestamp,
          payload: msg.payload,
        };
        // Mirror session_joined / session_left into the sessions cache so a
        // late-arriving subscriber that re-reads RoomState would see a
        // consistent view. Event delivery still fires first so UI handlers
        // can react.
        if (msg.type === "session_joined" && msg.payload) {
          const info = msg.payload as RemoteSession;
          if (!sub.sessions.find((s) => s.sessionId === info.sessionId)) {
            sub.sessions = [...sub.sessions, info];
          }
        } else if (msg.type === "session_left" && msg.payload) {
          const info = msg.payload as { sessionId: string };
          sub.sessions = sub.sessions.filter(
            (s) => s.sessionId !== info.sessionId
          );
        }
        sub.handlers.forEach((h) => h.onEvent?.(remote));
        return;
      }
    }
  }

  function subscribe(topic: string, handlers: TopicHandlers): () => void {
    let sub = subs.get(topic);
    const isFirst = !sub;
    if (!sub) {
      sub = { topic, handlers: new Set(), sessions: [] };
      subs.set(topic, sub);
    }
    sub.handlers.add(handlers);

    // Fire current per-topic state immediately so the hook can sync UI.
    handlers.onConnectionState?.(topicStateFor(sub));

    if (isFirst) {
      openSocket();
      if (ws && ws.readyState === WebSocket.OPEN) {
        sub.pendingRef = nextRef();
        sendSubscribe(topic, sub.pendingRef);
      }
      // else: open handler will send subscribe on connect.
    } else if (sub.permission && sub.mySessionId) {
      // Already subscribed on the wire; hand over the cached state to the new handler.
      handlers.onRoomState?.({
        mySessionId: sub.mySessionId,
        permission: sub.permission,
        sessions: sub.sessions,
      });
    }

    return () => {
      const s = subs.get(topic);
      if (!s) return;
      s.handlers.delete(handlers);
      if (s.handlers.size === 0) {
        subs.delete(topic);
        sendUnsubscribe(topic);
        if (totalHandlers() === 0) {
          closeSocket();
        }
      }
    };
  }

  function publish(
    topic: string,
    type: string,
    payload: Record<string, unknown>
  ): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    wireSend({ op: "publish", topic, type, payload });
  }

  function getConnectionState(): ConnectionState {
    return connectionState;
  }

  return { subscribe, publish, getConnectionState };
}
