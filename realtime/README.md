# moodio-realtime

WebSocket server for real-time collaboration on Moodio desktops and production tables. One authenticated connection per tab carries many dynamic topic subscriptions; permission is checked per-subscribe against the Next.js app. Optional cross-region federation via NATS. Sits behind Nginx alongside the Next.js app.

## Architecture

```
                        ┌─── Region A ───────────────────────────┐
Browser ──WebSocket──▶  │  Nginx (/ws*)  ──▶ Go realtime (:8081) │
Browser ──HTTP───────▶  │  Nginx (/*)    ──▶ Next.js app (:3000) │
                        └─────────────┬─────────────────────────┘
                                      │ NATS gateway
                        ┌─────────────┴─────────────────────────┐
Browser ──WebSocket──▶  │  Nginx (/ws*)  ──▶ Go realtime (:8081) │
Browser ──HTTP───────▶  │  Nginx (/*)    ──▶ Next.js app (:3000) │
                        └─── Region B ───────────────────────────┘
```

Each region runs an independent relay. When NATS is configured, events are forwarded across regions transparently so users in different regions see each other in real time.

Without NATS the server operates in single-server mode — no external dependencies beyond the Next.js API.

The server uses [melody](https://github.com/olahol/melody) (a gorilla/websocket wrapper) for connection management. Topic membership is an in-memory index (`map[topic] → set[*Session]`); no external state (no Redis, no database).

### Files

| File | Purpose |
|---|---|
| `main.go` | HTTP server, single `/ws/connection` multiplexed endpoint, `/ws/ping`, `/health`, `/check`, EC2 region auto-detection, federation bootstrap |
| `room.go` | Topic membership map, subscribe/unsubscribe/publish handlers, broadcast, federation message routing, session events |
| `connection.go` | `SessionKeys`, `SessionSubs` (per-session topic set + rate-limit bucket), per-(session, topic) authorize cache, per-session dispatch goroutine |
| `auth.go` | JWT validation from cookie, `MintInternalJWT` (aud=realtime-internal), `AuthorizeTopic` HTTP call |
| `protocol.go` | Wire envelopes (`IncomingOp`, `SubscribedAck`, `TopicEvent`, etc.) and `parseTopic` validation |
| `federation.go` | `Federator` interface, `FederatedMessage` struct with region ID, encode/decode helpers |
| `federation_nats.go` | NATS-based `Federator` implementation for cross-region message forwarding |
| `logging.go` | Region-tagged logging helpers (`logf`, `fatalf`) |
| `room_test.go` | Functional tests + benchmarks (subscribe/unsubscribe, multi-topic, isolation, rate-limit, cache, latency under pressure) |
| `production_table_test.go` | Production-table topic tests |
| `federation_test.go` | Cross-region federation tests using mock federators |
| `nginx.example.conf` | Example Nginx reverse proxy config |
| `Dockerfile` | Multi-stage Docker build (golang → distroless) |

## Connection Flow

1. Client connects to `GET /ws/connection` with the `moodio_access_token` cookie.
2. Server validates the JWT (HMAC-SHA256 signature + expiration). On failure → 401.
3. Server stashes the verified `Claims` on the session and upgrades the connection. **No topic is bound at this point.**
4. Client sends a `subscribe` op for each topic it cares about. For each subscribe:
   - Server mints a short-lived (60s) internal JWT (`aud=realtime-internal`) from the cached claims.
   - Server calls `GET /api/realtime/authorize?topic=<topic>` on the Next.js app with `Authorization: Bearer <internalJWT>`.
   - On 200 → subscription added, `subscribed` ack sent, `session_joined` broadcast to topic.
   - On 403/404/400 → `error` frame sent, no membership change.
   - Result cached per (sessionId, topic) for 30s; invalidated on unsubscribe.

Because the relay holds the verified claims for the lifetime of the connection, the user's 30-minute cookie TTL does not bound the WS lifetime — subscribes keep working until the WS itself drops.

### Why the authorize endpoint is relay-only

`/api/realtime/authorize` requires a bearer token with `aud: "realtime-internal"`. Only the relay (which holds `JWT_ACCESS_SECRET`) can mint such tokens. The browser's access-token cookie does not carry that audience, so a curl or fetch from the browser cannot authenticate the endpoint.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | Yes | — | HMAC-SHA256 secret shared with Next.js. Used to verify the user's access-token cookie AND to sign internal bearers for the authorize endpoint. |
| `PORT` | No | `8081` | Port the server listens on |
| `PERMISSION_API_BASE` | No | `http://localhost:3000` | Base URL for the Next.js authorize endpoint |
| `NATS_URL` | No | — | NATS server URL. Enables cross-region federation when set. Gracefully falls back to single-server mode if unreachable. |
| `REGION_ID` | No | auto-detected | Region identifier for federation. Auto-detected from EC2 Instance Metadata (IMDSv2) when not set. Falls back to `"no-region"`. |
| `NATS_REGION` | No | — | Selects the NATS gateway config file (`nats/nats-${NATS_REGION}.conf`) |

## Running

```bash
JWT_ACCESS_SECRET=your-secret go run .
```

With federation:

```bash
JWT_ACCESS_SECRET=your-secret NATS_URL=nats://localhost:4222 go run .
```

## HTTP Endpoints

### Health Check

```
GET /health → 200 "ok"
```

Minimal liveness probe. No logging, no computation.

### Region Check

```
GET /check → 200 {"status": "ok", "region": "us-east-2"}
```

Returns the server's AWS region by querying EC2 Instance Metadata (IMDSv2). Returns `"unknown"` when not running on EC2. Used by the admin WebSocket latency test page to display which region the relay is deployed in.

### Ping WebSocket

```
GET /ws/ping
```

Unauthenticated echo endpoint. Echoes back any message sent to it. Used by the admin latency test page to measure round-trip time. Max message size: **512 bytes**.

## WebSocket Protocol

The wire format is a JSON envelope with an `op` field in every frame.

### Connecting

```
ws://host/ws/connection
```

The handshake is authenticated by the `moodio_access_token` cookie. The path lives under `/ws/` so existing Nginx `location /ws/` blocks route it to the realtime upstream unchanged. No frames are emitted by the server until the client subscribes.

### Client → Server

Subscribe to a topic (identity is already known; server performs per-topic authorization):

```json
{ "op": "subscribe", "topic": "desktop:abc123", "ref": "c1" }
```

Unsubscribe:

```json
{ "op": "unsubscribe", "topic": "desktop:abc123", "ref": "c2" }
```

Publish an event to a topic this connection is subscribed to:

```json
{
  "op": "publish",
  "topic": "desktop:abc123",
  "type": "asset_moved",
  "payload": { "id": "asset-1", "x": 100, "y": 200 },
  "ref": "c3"
}
```

`ref` is an optional echoable correlation id. Topic format: `<namespace>:<id>` where namespace ∈ `{desktop, production-table}` and id matches `^[A-Za-z0-9_-]{1,128}$`.

### Server → Client

Successful subscribe:

```json
{
  "op": "subscribed",
  "topic": "desktop:abc123",
  "permission": "editor",
  "sessionId": "session_...",
  "sessions": [
    { "sessionId": "...", "userId": "...", "firstName": "...", "email": "...", "permission": "editor" }
  ],
  "ref": "c1"
}
```

The `sessions` list includes both local and remote (federated) participants and subsumes the old `room_joined` frame.

Successful unsubscribe:

```json
{ "op": "unsubscribed", "topic": "desktop:abc123", "ref": "c2" }
```

Error:

```json
{ "op": "error", "topic": "desktop:abc123", "code": "forbidden", "message": "...", "ref": "c1" }
```

Error codes: `forbidden`, `not_found`, `bad_request`, `rate_limited`, `not_subscribed`, `internal`.

Topic event (stamped by the server, scoped to a topic):

```json
{
  "op": "event",
  "topic": "desktop:abc123",
  "type": "asset_moved",
  "sessionId": "session_...",
  "userId": "...",
  "firstName": "Alice",
  "email": "alice@example.com",
  "timestamp": 1709000000000,
  "payload": { "id": "asset-1", "x": 100, "y": 200 }
}
```

`session_joined` / `session_left` use the same `op:"event"` envelope with their own `type`; the payload is a `SessionInfo` object.

### Permissions

Permission is **per-topic**, not per-connection. A session may be a viewer on topic A and an editor on topic B at the same time.

- **owner / editor** — can publish all event types
- **viewer** — all mutation events (see table below) are silently dropped at the relay

Permission is checked on each `subscribe`, cached per `(sessionId, topic)` for 30s, and invalidated on `unsubscribe`.

### Per-session limits

- **50 active topics** per connection.
- **20 subscribes / 10s** rolling window. Exceeding either returns `{op:"error", code:"rate_limited"}`.

### Mutation event types

| Event | Namespace | Logged |
|---|---|---|
| `asset_moved` | desktop | Yes |
| `asset_resized` | desktop | Yes |
| `asset_added` | desktop | Yes |
| `asset_removed` | desktop | Yes |
| `asset_dragging` | desktop | No |
| `asset_resizing` | desktop | No |
| `asset_selected` / `asset_deselected` | desktop | No |
| `asset_z_changed` | desktop | No |
| `cell_selected` / `cell_deselected` / `cell_updated` | desktop | No |
| `table_generating` | desktop | No |
| `pt_cell_selected` / `pt_cell_deselected` / `pt_cell_updated` | production-table | No |
| `pt_cell_comment_updated` | production-table | No |
| `pt_media_asset_added` / `pt_media_asset_removed` | production-table | No |
| `pt_column_added` / `pt_column_removed` / `pt_column_renamed` / `pt_column_resized` / `pt_columns_reordered` | production-table | No |
| `pt_row_added` / `pt_row_removed` / `pt_row_resized` / `pt_rows_reordered` | production-table | No |

Non-mutation events (e.g. `cursor_move`, `cursor_leave`, `pt_cursor_move`, `pt_cursor_leave`, `video_suggest_updated`, `video_generation_polling`) are delivered regardless of viewer/editor permission.

## Topic / Room Model

A "topic" is the unit of fan-out: `<namespace>:<id>`. The `RoomManager` tracks `map[topic] → set[*Session]`. Each session also tracks its own `SessionSubs` (topic → permission), plus a token-bucket subscribe rate limiter. Empty topics are garbage-collected when the last local session unsubscribes or disconnects; when that last session was the last local subscriber, federation unsubscribe also fires.

Messages are broadcast directly to topic members, bypassing Melody's global `BroadcastFilter` so sessions in unrelated topics are never touched.

When federation is active, `broadcastToTopic` delivers locally then publishes to NATS. `broadcastToTopicLocal` is used for messages received from other regions to avoid re-publishing back to NATS.

## Cross-Region Federation

Federation allows multiple relay servers in different AWS regions to share events for the same topic, so users connected to different regions see each other in real time.

### How It Works

1. **Auto-enable**: Federation activates automatically when `NATS_URL` is set. Safe to enable even with a single region — messages published to NATS are discarded by the region ID dedup check when no other region exists.

2. **Region identification**: Each server identifies itself by `REGION_ID` (env var) or auto-detects from EC2 Instance Metadata (IMDSv2). The region ID is embedded in every federated message so receiving servers skip messages they themselves published.

3. **Message format**: Federated messages are JSON-wrapped with the originating region:
   ```json
   {"r": "us-east-2", "p": <original event payload>}
   ```
   The inner payload is the `TopicEvent` JSON — it carries its own `topic` field which receivers cross-check against the NATS subject (defense in depth against cross-wired payloads).

4. **NATS subjects**: Events are published to `room.{topic}`. Cross-region forwarding is handled transparently by NATS gateways.

5. **Presence sync**: When the first local subscriber joins a topic, the server publishes a `presence_sync_request` to NATS. Other regions respond by publishing `session_joined` events for their local subscribers, so the newcomer discovers remote participants.

6. **Remote session tracking**: The `RoomManager` maintains a `remoteSessions` map (keyed by topic) that tracks sessions connected to other regional relays. These remote sessions are included in `subscribed` ack responses so joining clients see the full participant list across all regions.

7. **Local-only broadcast**: Messages received from other regions via NATS are broadcast only to local sessions (`broadcastToTopicLocal`) — they are not re-published to NATS, preventing infinite loops.

### NATS Connection Resilience

The NATS client is configured with automatic reconnection (2-second wait, unlimited retries). Disconnect and reconnect events are logged. If NATS is unreachable at startup, the server logs a warning and runs without federation.

## Logging

All log lines are tagged with a region prefix: `[local]` for events originating on the current server, or `[us-east-2]`, `[ap-northeast-1]`, etc. for events received via federation.

| Prefix | Examples |
|---|---|
| `[local] [auth]` | JWT validation failures |
| `[local] [connect]` | New WebSocket connections (no topic at this point) |
| `[local] [sub]` / `[sub-deny]` | Subscribe success / failure with code |
| `[local] [unsub]` | Unsubscribe |
| `[local] [disconnect]` | Teardown with total topics dropped |
| `[local] [room]` | Viewer-mutation drops, federation presence |
| `[local] [event]` | State-changing events (`asset_moved`, `asset_resized`, `asset_added`, `asset_removed`) |
| `[local] [federation]` | Federation enable/disable, publish errors, topic mismatches |
| `[local] [nats]` | NATS connection/disconnection/reconnection events |
| `[{region}] [room]` | Remote session joins/leaves via federation |
| `[{region}] [event]` | Remote state events via federation |

## Nginx Setup

See `nginx.example.conf` for routing `/ws/` (both `/ws/connection` and `/ws/ping`) to this server and everything else to Next.js. Key settings:

- `proxy_http_version 1.1` + `Upgrade` / `Connection` headers for WebSocket
- `proxy_read_timeout 86400` to keep idle connections alive for 24h

## Tests

### Run All Tests

```bash
go test -race ./...
```

### Functional Tests

| Test | What it verifies |
|---|---|
| `TestSubscribe_Ack` | Subscribe receives `subscribed` with permission + empty sessions list |
| `TestSubscribe_MultiTopicOneConnection` | One session multiplexes two topics; events route independently |
| `TestSubscribe_Forbidden` | `authorize` returns 403 → `error forbidden`; no membership leaks |
| `TestSubscribe_BadRequestForUnknownNamespace` | Unknown namespace → `error bad_request` |
| `TestUnsubscribe_Leaves` | `session_left` broadcast; former subscriber no longer receives publishes |
| `TestDisconnect_MultiTopicCleanup` | All subscribed topics see `session_left`; empty topics GC'd |
| `TestViewer_PerTopic` | Same session viewer on A, editor on B; mutation on A dropped, on B delivered |
| `TestResubscribe_Idempotent` | Second subscribe sends ack but no extra `session_joined` |
| `TestSubscribeStorm_RateLimited` | 30 rapid subscribes → some `rate_limited` |
| `TestAuthorizeCache_HitAndInvalidate` | Cache hit on resubscribe; unsubscribe invalidates |
| `TestRoomIsolation` | Events in topic A don't reach topic B; sender doesn't echo |
| `TestJoinEventsCorrectness` | Ack lists existing sessions; `session_joined` broadcasts |
| `TestDisconnectBroadcast` | `session_left` on disconnect |
| `TestViewerCannotMutate` | All desktop mutation types blocked for viewers |
| `TestEditorCanMutate` | Editors can publish mutations |
| `TestStampedIdentity` | Outgoing events carry correct userId, firstName, timestamp |
| `TestManyTopicsIsolation` | 10 topics, each receives only its own payloads |

### Production Table Tests

| Test | What it verifies |
|---|---|
| `TestPTRoomIsolation_CrossType` | Desktop topic and PT topic with the same id are isolated by namespace prefix |
| `TestPTRoomBroadcast` | Events sent in a PT topic reach other participants with stamped identity |
| `TestPTViewerCannotMutate` | All `pt_*` mutation types blocked for viewers |
| `TestPTEditorCanMutate` | Editors can publish all `pt_*` mutation types |
| `TestPTJoinAndDisconnect` | Ack session list + `session_joined` + `session_left` work in PT topics |
| `TestPTMultiRoomIsolation` | 5 PT topics, each receives only its own payloads |

### Federation Tests

| Test | What it verifies |
|---|---|
| `TestFederationCrossRegionBroadcast` | Event sent in US region arrives in HK region |
| `TestFederationBidirectional` | Events flow in both directions |
| `TestFederationPresenceEvents` | `session_joined` / `session_left` propagate cross-region |
| `TestFederationRoomIsolation` | Cross-region messages respect topic boundaries |
| `TestFederationSenderDoesNotEcho` | Sender doesn't receive their own message back via federation |
| `TestFederationPresenceSync` | Latecomer region discovers existing subscribers via presence sync |

Federation tests use a `mockFederator` pair that simulates two regions without a real NATS server.

### Benchmarks

```bash
go test -bench=. -benchmem -benchtime=3s -run='^$'
```

| Benchmark | Setup | What it measures |
|---|---|---|
| `BenchmarkBroadcastSameTopic` | 20 clients, 1 topic | Single-topic broadcast throughput |
| `BenchmarkBroadcastManyTopics` | 250 sessions, 50 topics | Multi-topic broadcast (topic index efficiency) |
| `BenchmarkGetSessionsInTopic` | 500 sessions, 50 topics | Topic member lookup cost |

### Latency Under Pressure

`TestLatencyUnderPressure` measures end-to-end event delivery latency in a target topic while all other topics send concurrent traffic.

```bash
go test -v -run TestLatencyUnderPressure -timeout 300s
```

Set `MOODIO_PRESSURE_LEVELS=all` (or a comma list like `heavy,extreme`) to run all pressure levels; the default runs only `light` and `medium`.

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| [olahol/melody](https://github.com/olahol/melody) | v1.4.0 | WebSocket session management |
| [gorilla/websocket](https://github.com/gorilla/websocket) | v1.5.0 | WebSocket protocol (used by melody + tests) |
| [google/uuid](https://github.com/google/uuid) | v1.6.0 | Session ID generation |
| [nats-io/nats.go](https://github.com/nats-io/nats.go) | v1.49.0 | Cross-region federation pub/sub |

Max message size: **65 kB** (`/ws/connection`), **512 B** (`/ws/ping`).
