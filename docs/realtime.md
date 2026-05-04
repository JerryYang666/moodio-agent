# Realtime integration guide

How the Next.js app talks to the Go realtime relay, and how to add a new topic namespace (e.g. `folder:*`).

For the Go relay itself — wire protocol, server-side lifecycle, federation — see `realtime/README.md`. This doc is the **consumer-side** companion: what page code sees, what the singleton does, and what you need to wire up when you introduce a new realtime surface.

---

## TL;DR for new features

You almost certainly want to:

1. **Pick a namespace** (e.g. `folder`). Add it to the allowlist in **two** places: the Go relay (`realtime/protocol.go`) and the Next.js dispatcher (`lib/realtime/authorize.ts`).
2. **Add a permission resolver** under `lib/<feature>/permissions.ts` that returns `"owner" | "editor" | "viewer" | null`, then wire it into `authorizeTopic`.
3. **Write a thin hook** in `hooks/` modeled on `use-desktop-ws.ts`. Give it a resource ID, have it call `getRealtimeClient().subscribe(\`<ns>:${id}\`, handlers)`, map events into component state, and return a stable shape.
4. (Optional) Add the new event types to `isMutationEvent` in the Go relay if viewers must not emit them.
5. Don't touch Nginx. The socket lives at `/ws/connection`, which is already routed.

Everything else — socket lifecycle, reconnect, re-subscribe, rate limits, per-topic permission caching, federation — is handled by the shared layer.

---

## Architecture at a glance

```
┌───────────────┐  useFolderWS(id)   ┌──────────────────┐
│ FolderPage    │ ─────────────────▶ │ useFolderWS      │
│ (your code)   │ ◀───────────────── │ (thin wrapper)   │
└───────────────┘   state + actions  └────────┬─────────┘
                                              │ client.subscribe("folder:abc", handlers)
                                              │ client.publish(...)
                                              ▼
                                    ┌────────────────────┐
                                    │  RealtimeClient    │   module singleton,
                                    │  (lib/realtime/    │   one WebSocket per tab,
                                    │   client.ts)       │   refcounted subs.
                                    └────────┬───────────┘
                                             │ WebSocket /ws/connection
                                             ▼
                                    ┌────────────────────┐
                                    │  Go relay          │   per-session dispatcher,
                                    │  (realtime/*)      │   per-topic membership.
                                    └────────┬───────────┘
                                             │ HTTP GET /api/realtime/authorize
                                             │ (Bearer aud=realtime-internal)
                                             ▼
                                    ┌────────────────────┐
                                    │ authorizeTopic()   │   dispatches by namespace
                                    │ (lib/realtime/     │   to feature permission
                                    │  authorize.ts)     │   helpers.
                                    └────────────────────┘
```

Three invariants worth remembering:

- **One WebSocket per tab, lazily opened on first subscribe, auto-closed when the last subscription is dropped.**
- **Authorization is per-topic, not per-connection.** A user can be an editor on desktop A and a viewer on desktop B at the same time on the same socket.
- **The authorize endpoint is relay-only.** It requires a bearer minted by the Go relay with `aud=realtime-internal`. Browser cookies cannot reach it. Do not try to call `/api/realtime/authorize` from client code.

---

## How the client layer works

### Page component

Page code never sees `WebSocket`, `subscribe`, or `unsubscribe` directly. It uses a feature-specific hook:

```tsx
const { connectionState, sendEvent, sessions, ... } =
  useDesktopWebSocket({ desktopId, enabled: true });
```

`connectionState` is one of `connecting | connected | reconnecting | polling | disconnected` and reflects the **topic-level** state, not the socket state. It only becomes `"connected"` after the server acknowledges the subscribe. A `forbidden` response flips it to `"disconnected"` and the client stops retrying that topic.

### Hook layer (`hooks/use-*-ws.ts`)

A hook does three things:

1. Translates the resource ID the page cares about into a topic string.
2. Calls `getRealtimeClient().subscribe(topic, handlers)` in a `useEffect`, and returns the `unsubscribe` function as the cleanup.
3. Maps wire events into component-friendly state (e.g. a `Map<sessionId, RemoteSession>`), and exposes a stable return shape.

```tsx
useEffect(() => {
  if (!enabled || !desktopId) return;
  const client = getRealtimeClient({ wsUrl });
  const topic = `desktop:${desktopId}`;

  const unsubscribe = client.subscribe(topic, {
    onConnectionState: setConnectionState,
    onRoomState: ({ mySessionId, sessions }) => { /* ... */ },
    onEvent: (event) => { /* dispatch by event.type */ },
    onError: (err) => { /* e.g. show toast on forbidden */ },
  });

  return unsubscribe;
}, [enabled, desktopId, wsUrl]);
```

`sendEvent` is a thin wrapper around `client.publish(topic, type, payload)`:

```tsx
const sendEvent = useCallback(
  (type, payload) => {
    const client = getRealtimeClient({ wsUrl });
    client.publish(`desktop:${desktopId}`, type, payload);
  },
  [desktopId, wsUrl]
);
```

### `RealtimeClient` (`lib/realtime/client.ts`)

A module-level singleton. Key behaviors:

- **Lazy open**: the first `subscribe` call opens the WebSocket. Before that, no socket exists.
- **Refcounted subscriptions**: if two components subscribe to the same topic, only one wire `subscribe` goes out. The second `unsubscribe` fires the wire `unsubscribe`. The second subscriber also receives the cached `roomState` synchronously so it doesn't wait for a round trip.
- **Reconnect resubscribe**: on `onclose`, the client exponentially backs off (1s → 30s cap), and on the next `onopen` replays every active subscription with fresh `ref`s.
- **Polling fallback**: after 5 failed reconnect attempts, `connectionState` becomes `"polling"`. Hooks can read that and trigger a REST `fetchDetail()` timer until the socket comes back.
- **Auto-close**: when the last handler unsubscribes, the client closes the socket. It will lazily re-open when a future `subscribe` happens.
- **Forbidden topics stop retrying**: if the server returns `{op:"error", code:"forbidden"}` for a topic, the client marks that topic and does NOT resubscribe on reconnect. A fresh `subscribe()` call is required.
- **Publish is fire-and-forget**: publishes while disconnected are silently dropped. The client does not queue them. Optimistic updates + REST persistence in the dispatcher pattern (see `docs/operation-history.md`) is the intended way to handle this.

### Wire envelope

The client speaks the following envelope on `/ws/connection`. See `realtime/README.md` for the authoritative reference.

```jsonc
// client -> server
{"op": "subscribe",   "topic": "desktop:abc", "ref": "c1"}
{"op": "unsubscribe", "topic": "desktop:abc", "ref": "c2"}
{"op": "publish",     "topic": "desktop:abc",
 "type": "asset_moved", "payload": {...}, "ref": "c3"}

// server -> client
{"op": "subscribed",   "topic": "...", "permission": "editor",
 "sessionId": "session_...", "sessions": [...], "ref": "c1"}
{"op": "unsubscribed", "topic": "...", "ref": "c2"}
{"op": "error", "topic": "...?", "code": "forbidden|not_found|bad_request|rate_limited|not_subscribed|internal",
 "message": "...", "ref": "...?"}
{"op": "event", "topic": "...", "type": "asset_moved",
 "sessionId": "...", "userId": "...", "firstName": "...", "email": "...",
 "timestamp": 1714..., "payload": {...}}
```

**Topic format**: `<namespace>:<id>` where `id` matches `^[A-Za-z0-9_-]{1,128}$`. Both the relay (`realtime/protocol.go`) and Next.js (`lib/realtime/authorize.ts`) enforce this. Make sure the IDs you use for a new namespace fit.

---

## Adding a new namespace (worked example: `folder`)

Imagine you want live presence + event broadcasting for folders (`folder:<folderId>`). Here's every file you touch.

### 1. Add the namespace to the relay allowlist

**`realtime/protocol.go`**
```go
var allowedTopicNamespaces = map[string]bool{
    "desktop":          true,
    "production-table": true,
    "folder":           true,   // <— add
}
```

Without this, the relay returns `{op:"error", code:"bad_request"}` on any `subscribe` for `folder:*`.

### 2. Write the permission resolver

**`lib/folder/permissions.ts`** (new)
```ts
import { db } from "@/lib/db";
// ...
import { PERMISSION_OWNER, type PermissionOrNull } from "@/lib/permissions";

export async function getFolderPermission(
  folderId: string,
  userId: string
): Promise<PermissionOrNull> {
  // 1. Owner check (user owns the folder)
  // 2. Share check (folder is shared with this user)
  // Return PERMISSION_OWNER / "editor" / "viewer" / null
}
```

Keep the shape identical to `getDesktopPermission` — returns a permission string or `null` for "no access."

### 3. Wire it into the authorize dispatcher

**`lib/realtime/authorize.ts`**
```ts
const ALLOWED_NAMESPACES = new Set(["desktop", "production-table", "folder"]);

// inside authorizeTopic:
if (parsed.namespace === "folder") {
  const permission = await getFolderPermission(parsed.id, userId);
  if (!permission) return { error: "forbidden" };
  return { permission: permission as RealtimePermission };
}
```

If folders have granular grants like production-table (column/row shares), mirror the viewer→editor promotion block.

### 4. Define the event contract

Pick your event types before you write the hook. Good names are verb-phrase, lowercase, namespace-prefixed if they're domain-specific:

- `folder_renamed` (mutation, should probably be logged)
- `folder_item_added` / `folder_item_removed` (mutations)
- `folder_cursor_move` (non-mutation, cursors)

**Update the Go relay mutation list** if viewers must not emit certain events. Edit `isMutationEvent` in `realtime/room.go`:

```go
case "folder_renamed", "folder_item_added", "folder_item_removed":
    return true
```

Viewers sending anything in this list are silently dropped by the relay. Non-mutation events (cursors, selection indicators, ephemeral UI state) should NOT be in this list.

If an event represents structural state worth logging, also add it to `isStateEvent`. It only affects logging verbosity, not delivery.

### 5. Write the hook

**`hooks/use-folder-ws.ts`** (new) — model after `hooks/use-desktop-ws.ts`. Minimal skeleton:

```tsx
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
  // add any per-session UI state your feature tracks
}

export type { RemoteEvent } from "@/lib/realtime/client";

interface UseFolderWSOptions {
  folderId: string;
  enabled?: boolean;
  wsUrl?: string;
  pollingInterval?: number;
  onRemoteEvent?: (event: RemoteEvent) => void;
  fetchDetail?: () => Promise<any>;
}

export function useFolderWS({
  folderId,
  enabled = true,
  wsUrl,
  pollingInterval = 10000,
  onRemoteEvent,
  fetchDetail,
}: UseFolderWSOptions) {
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

  // Polling fallback when the socket is stuck.
  useEffect(() => {
    if (connectionState === "polling" && fetchDetailRef.current) {
      pollingTimer.current = setInterval(() => {
        fetchDetailRef.current?.();
      }, pollingInterval);
      return () => {
        if (pollingTimer.current) clearInterval(pollingTimer.current);
      };
    }
    return undefined;
  }, [connectionState, pollingInterval]);

  useEffect(() => {
    if (!enabled || !folderId) return;

    const client = getRealtimeClient({ wsUrl });
    const topic = `folder:${folderId}`;

    const unsubscribe = client.subscribe(topic, {
      onConnectionState: setConnectionState,
      onRoomState: ({ mySessionId: mine, sessions: list }) => {
        setMySessionId(mine);
        const next = new Map<string, RemoteSession>();
        for (const s of list) next.set(s.sessionId, s as RemoteSession);
        setSessions(next);
      },
      onEvent: (event) => {
        if (event.type === "session_joined") { /* ... */ return; }
        if (event.type === "session_left")   { /* ... */ return; }
        // domain events — route by event.type
        onRemoteEventRef.current?.(event);
      },
      onError: (err) => {
        // err.code === "forbidden" → show a toast, or redirect
      },
    });

    return () => {
      unsubscribe();
      setMySessionId(null);
      setSessions(new Map());
    };
  }, [enabled, folderId, wsUrl]);

  const sendEvent = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      if (!folderId) return;
      const client = getRealtimeClient({ wsUrl });
      client.publish(`folder:${folderId}`, type, payload);
    },
    [folderId, wsUrl]
  );

  const connectedUsers = useMemo(() => {
    // derive unique-by-userId list — same pattern as other hooks
    // ...
    return [] as Array<{ userId: string; firstName: string; email: string; initial: string; sessionCount: number }>;
  }, [sessions]);

  return {
    connectionState,
    mySessionId,
    sendEvent,
    connectedUsers,
    sessions,
  };
}
```

### 6. Use it in the page

```tsx
const { connectionState, sendEvent, connectedUsers } = useFolderWS({
  folderId,
  enabled: true,
  fetchDetail: fetchFolderDetail,
  onRemoteEvent: (event) => {
    if (event.type === "folder_renamed") {
      applyRename(event.payload.newName);
    }
  },
});
```

### 7. Dispatch pattern for mutations

For any mutation that needs to survive a reload, follow the three-step pattern documented in `docs/operation-history.md`:

1. **Apply locally** (optimistic update).
2. **Broadcast via `sendEvent`** so peers see it immediately.
3. **Persist via REST** (`PATCH /api/folder/...`) so the change is durable.

Do NOT rely on the realtime socket for persistence. The relay forgets events the moment it broadcasts them.

### 8. Tests to add

- **Permission resolver unit test** — in whatever pattern the rest of `lib/folder/` uses.
- **Dispatcher test** — extend `__tests__/realtime-authorize.test.ts` with a `folder:*` case asserting `authorizeTopic` calls your new resolver.
- **Route integration test** — add a case to the `GET /api/realtime/authorize` block.
- (Optional) **Hook behavioral test** — the client is already covered; most folder-hook tests are best as UI integration tests in the page.

No new Go-side tests are strictly required for the namespace itself — the allowlist entry is the only change, and existing tests already cover `parseTopic` rejecting unknown namespaces. If you want belt-and-suspenders, add a `TestFederation_FolderTopicWorks` mirroring the existing production-table one.

---

## Things the shared layer already handles (don't reimplement)

- **WebSocket lifecycle**: open, close, reconnect, backoff, polling fallback.
- **JWT cookie auth at handshake**: the relay validates the user's access token once per connection.
- **Per-topic authorization**: handled automatically on every `subscribe`. Result cached 30s per `(sessionId, topic)`; busted on `unsubscribe`.
- **Rate limiting**: 50 topics max per session, 20 subscribes / 10s. Excess returns `rate_limited`.
- **Cross-region federation**: NATS subject is `room.{topic}`. Presence sync, remote session tracking, and echo prevention all work for any new namespace for free.
- **Identity stamping**: every outgoing event carries `sessionId`, `userId`, `firstName`, `email`, `timestamp`.

## Things you must NOT do

- **Don't open raw WebSockets.** Always go through `getRealtimeClient`.
- **Don't call `/api/realtime/authorize` from client code.** The endpoint rejects non-`realtime-internal` bearers and has no useful meaning from a browser.
- **Don't bypass the permission resolver by encoding permission into the topic name.** Permission is always determined server-side.
- **Don't depend on ordering of events from different topics.** Each topic is an independent stream over the shared socket.
- **Don't publish while `connectionState !== "connected"`.** The client silently drops those publishes — they're lost. Defer the action or rely on REST + reload-time recovery.
- **Don't store the `getRealtimeClient()` return value in React state.** It's a stable singleton; just call it when you need it.

---

## Related docs / code

- `realtime/README.md` — Go relay architecture, wire protocol details, federation, test layout.
- `docs/operation-history.md` — the three-step "apply + broadcast + persist" pattern for mutations.
- `docs/authentication.md` — JWT issuance, cookie setup (the realtime relay reuses `JWT_ACCESS_SECRET`).
- `lib/realtime/client.ts` — the singleton. Read this when debugging connection-state weirdness.
- `lib/realtime/authorize.ts` — the namespace dispatcher. Read this when debugging 403s.
- `hooks/use-desktop-ws.ts` / `hooks/use-production-table-ws.ts` — reference implementations for new hooks.
- `__tests__/realtime-authorize.test.ts` / `__tests__/realtime-client.test.ts` — tests that double as spec.
