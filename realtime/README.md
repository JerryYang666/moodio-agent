# moodio-realtime

WebSocket server for real-time collaboration on Moodio desktops. Handles room-based presence, event broadcasting, permission enforcement, and optional cross-region federation via NATS. Sits behind Nginx alongside the main Next.js app.

## Architecture

```
                        ┌─── Region A ───────────────────────────┐
Browser ──WebSocket──▶  │  Nginx (/ws/*) ──▶ Go realtime (:8081) │
Browser ──HTTP───────▶  │  Nginx (/*) ────▶ Next.js app (:3000)  │
                        └─────────────┬─────────────────────────┘
                                      │ NATS gateway
                        ┌─────────────┴─────────────────────────┐
Browser ──WebSocket──▶  │  Nginx (/ws/*) ──▶ Go realtime (:8081) │
Browser ──HTTP───────▶  │  Nginx (/*) ────▶ Next.js app (:3000)  │
                        └─── Region B ───────────────────────────┘
```

Each region runs an independent relay server. When NATS is configured, events are forwarded across regions transparently so users in different regions collaborating on the same desktop see each other's changes in real time.

Without NATS the server operates in single-server mode — no external dependencies beyond the Next.js API.

The server uses [melody](https://github.com/olahol/melody) (a gorilla/websocket wrapper) for connection management. Rooms are managed via an in-memory index — each desktop ID maps to a set of WebSocket sessions. There is no external state (no Redis, no database).

### Files

| File | Purpose |
|---|---|
| `main.go` | HTTP server, route setup (`/ws/desktop/{id}`, `/ws/ping`, `/health`, `/check`), EC2 region auto-detection, federation bootstrap |
| `room.go` | Room manager, broadcast, session handling, presence events, federation message routing, permission checks |
| `auth.go` | JWT validation from cookie, permission API call, session ID generation |
| `federation.go` | `Federator` interface, `FederatedMessage` struct with region ID, encode/decode helpers |
| `federation_nats.go` | NATS-based `Federator` implementation for cross-region message forwarding |
| `logging.go` | Region-tagged logging helpers (`logf`, `fatalf`) |
| `room_test.go` | Functional tests + benchmarks (isolation, permissions, latency under pressure) |
| `federation_test.go` | Cross-region federation tests using mock federators |
| `nginx.example.conf` | Example Nginx reverse proxy config |
| `Dockerfile` | Multi-stage Docker build (golang → distroless) |

## Connection Flow

1. Client connects to `GET /ws/desktop/{desktopId}` with a `moodio_access_token` cookie
2. Server validates the JWT (HMAC-SHA256 signature + expiration)
3. Server calls the Next.js API at `GET /api/desktop/{desktopId}/permission?userId={userId}` to check the user's permission level, forwarding the original cookies
4. On success, the connection is upgraded to WebSocket and the session joins the room

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | Yes | — | HMAC-SHA256 secret for validating JWT access tokens |
| `PORT` | No | `8081` | Port the server listens on |
| `PERMISSION_API_BASE` | No | `http://localhost:3000` | Base URL for the Next.js permission API |
| `NATS_URL` | No | — | NATS server URL. Enables cross-region federation when set. Gracefully falls back to single-server mode if unreachable. |
| `REGION_ID` | No | auto-detected | Region identifier for federation. Auto-detected from EC2 instance metadata (IMDSv2) when not set. Falls back to `"no-region"`. |
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

## Cross-Region Federation

Federation allows multiple relay servers in different AWS regions to share events for the same desktop rooms, so users connected to different regions see each other in real time.

### How It Works

1. **Auto-enable**: Federation activates automatically when `NATS_URL` is set. Safe to enable even with a single region — messages published to NATS are discarded by the region ID dedup check when no other region exists.

2. **Region identification**: Each server identifies itself by `REGION_ID` (env var) or auto-detects from EC2 Instance Metadata (IMDSv2). The region ID is embedded in every federated message so receiving servers skip messages they themselves published.

3. **Message format**: Federated messages are JSON-wrapped with the originating region:
   ```json
   {"r": "us-east-2", "p": <original event payload>}
   ```

4. **NATS subjects**: Room events are published to `room.{roomId}`. Cross-region forwarding is handled transparently by NATS gateways.

5. **Presence sync**: When the first local session joins a room, the server publishes a `presence_sync_request` to NATS. Other regions respond by publishing `session_joined` events for their local sessions, so the newcomer discovers remote participants. This handles the case where a region joins a room after users in other regions are already present.

6. **Remote session tracking**: The `RoomManager` maintains a `remoteSessions` map (keyed by room ID) that tracks sessions connected to other regional relays. These remote sessions are included in `room_joined` responses so joining clients see the full participant list across all regions.

7. **Local-only broadcast**: Messages received from other regions via NATS are broadcast only to local sessions (`broadcastToRoomLocal`) — they are not re-published to NATS, preventing infinite loops.

### NATS Connection Resilience

The NATS client is configured with automatic reconnection (2-second wait, unlimited retries). Disconnect and reconnect events are logged. If NATS is unreachable at startup, the server logs a warning and runs without federation.

## Logging

All log lines are tagged with a region prefix: `[local]` for events originating on the current server, or `[us-east-2]`, `[ap-northeast-1]`, etc. for events received via federation from other regions. This makes it easy to trace cross-region event flow in aggregated logs.

Log categories:

| Prefix | Examples |
|---|---|
| `[local] [auth]` | JWT validation failures, permission denials |
| `[local] [connect]` | New WebSocket connections with user/session/permission details |
| `[local] [room]` | Session joins, leaves, room membership counts |
| `[local] [event]` | State-changing events (`asset_moved`, `asset_resized`, etc.) with truncated payloads |
| `[local] [federation]` | Federation enable/disable, publish errors, presence sync |
| `[local] [nats]` | NATS connection/disconnection/reconnection events |
| `[local] [check]` | Region check requests |
| `[{region}] [room]` | Remote session joins/leaves received via federation |
| `[{region}] [event]` | Remote state events received via federation |

## WebSocket Protocol

### Connecting

Connect to `ws://host/ws/desktop/{desktopId}` with the `moodio_access_token` cookie set.

On connect, the server sends a `room_joined` event to the new client:

```json
{
  "type": "room_joined",
  "sessionId": "session_abc123...",
  "sessions": [
    { "sessionId": "...", "userId": "...", "firstName": "...", "email": "...", "permission": "editor" }
  ]
}
```

The `sessions` list includes both local and remote (federated) participants.

All other clients in the room (local and remote via federation) receive a `session_joined` event:

```json
{
  "type": "session_joined",
  "sessionId": "...",
  "userId": "...",
  "firstName": "Alice",
  "email": "alice@example.com",
  "timestamp": 1709000000000,
  "payload": { "sessionId": "...", "userId": "...", "firstName": "Alice", "email": "...", "permission": "editor" }
}
```

### Sending Events

Send a JSON message with `type` and `payload`:

```json
{ "type": "asset_moved", "payload": { "id": "asset-1", "x": 100, "y": 200 } }
```

The server stamps the sender's identity and broadcasts to all other sessions in the same room (including remote sessions via federation):

```json
{
  "type": "asset_moved",
  "sessionId": "session_abc123...",
  "userId": "user-id",
  "firstName": "Alice",
  "email": "alice@example.com",
  "timestamp": 1709000000000,
  "payload": { "id": "asset-1", "x": 100, "y": 200 }
}
```

### Disconnecting

When a session disconnects, the server broadcasts `session_left` to all remaining room members (local and remote via federation).

### Event Types

| Event | Direction | Mutating | Logged |
|---|---|---|---|
| `room_joined` | Server → joining client | — | — |
| `session_joined` | Server → room | — | — |
| `session_left` | Server → room | — | — |
| `asset_moved` | Client → Server → room | Yes | Yes |
| `asset_resized` | Client → Server → room | Yes | Yes |
| `asset_added` | Client → Server → room | Yes | Yes |
| `asset_removed` | Client → Server → room | Yes | Yes |
| `asset_dragging` | Client → Server → room | Yes | No |
| `asset_resizing` | Client → Server → room | Yes | No |
| `asset_selected` | Client → Server → room | Yes | No |
| `asset_deselected` | Client → Server → room | Yes | No |
| `cell_selected` | Client → Server → room | Yes | No |
| `cell_deselected` | Client → Server → room | Yes | No |
| `cell_updated` | Client → Server → room | Yes | No |
| `table_generating` | Client → Server → room | Yes | No |
| `presence_sync_request` | Federation internal | — | — |

### Permissions

- **editor** — can send all event types
- **viewer** — all mutation events are silently blocked server-side

Permission is checked once at connection time via the Next.js API and cached for the session lifetime.

## Room Model

Rooms are implicit — a room is the set of sessions sharing a `desktopId`. The `RoomManager` maintains an in-memory index (`map[roomId]set[*Session]`) for O(room-size) lookups and broadcasts. Empty rooms are garbage-collected automatically when the last session disconnects.

Messages are broadcast directly to room members, bypassing Melody's global `BroadcastFilter` to avoid iterating over sessions in unrelated rooms.

When federation is active, `broadcastToRoom` delivers locally then publishes to NATS. `broadcastToRoomLocal` is used for messages received from other regions to avoid re-publishing back to NATS.

## Nginx Setup

See `nginx.example.conf` for routing `/ws/*` to this server and everything else to Next.js. Key settings:

- `proxy_http_version 1.1` + `Upgrade` / `Connection` headers for WebSocket
- `proxy_read_timeout 86400` to keep idle connections alive for 24h

## Tests

### Run All Tests

```bash
go test -v ./...
```

### Run Functional Tests

```bash
go test -v -run '^Test(RoomIsolation|JoinEvents|Disconnect|Viewer|Editor|Stamped|ManyRooms|Federation)' ./...
```

### Functional Tests

| Test | What it verifies |
|---|---|
| `TestRoomIsolation` | Events in room A don't reach room B; sender doesn't echo |
| `TestRoomIsolation_BidirectionalMultiRoom` | Two isolated rooms, neither leaks |
| `TestJoinEventsCorrectness` | `room_joined` lists existing sessions; `session_joined` broadcasts |
| `TestDisconnectBroadcast` | `session_left` fires on disconnect |
| `TestViewerCannotMutate` | All mutation types blocked for viewers |
| `TestEditorCanMutate` | Editors can send mutations |
| `TestStampedIdentity` | Outgoing events have correct userId, firstName, timestamp |
| `TestManyRoomsIsolation` | 10 rooms, each receives only its own payloads |

### Federation Tests

| Test | What it verifies |
|---|---|
| `TestFederationCrossRegionBroadcast` | Message sent in US region arrives in HK region via federation |
| `TestFederationBidirectional` | Messages flow in both directions between regions |
| `TestFederationPresenceEvents` | `session_joined` and `session_left` propagate cross-region |
| `TestFederationRoomIsolation` | Cross-region messages respect room boundaries |
| `TestFederationSenderDoesNotEcho` | Sender doesn't receive their own message back via federation |
| `TestFederationPresenceSync` | Latecomer region discovers existing sessions via presence sync request/response |

Federation tests use a `mockFederator` pair that simulates two regions without a real NATS server. Each pair links two mock federators so `Publish` on one delivers to the other's subscribers with proper region ID dedup.

### Benchmarks

```bash
go test -bench=. -benchmem -benchtime=3s -run='^$'
```

| Benchmark | Setup | What it measures |
|---|---|---|
| `BenchmarkBroadcastSameRoom` | 20 clients, 1 room | Single-room broadcast throughput |
| `BenchmarkBroadcastManyRooms` | 250 sessions, 50 rooms | Multi-room broadcast (room index efficiency) |
| `BenchmarkGetSessionsInRoom` | 500 sessions, 50 rooms | Room member lookup cost |

### Benchmark Results (Apple M-series, Go 1.25)

| Benchmark | ns/op | B/op | allocs/op |
|---|---|---|---|
| `BroadcastSameRoom` (20 clients) | 1,020,192 | 7,297 | 39 |
| `BroadcastManyRooms` (250 sessions, 50 rooms) | 9,135 | 3,280 | 22 |
| `GetSessionsInRoom` (500 sessions, 50 rooms) | 14.05 | 0 | 0 |

The room index makes multi-room broadcast **7.2x faster** than the naive global-scan approach, and room member lookups are effectively free at **14 ns** with zero allocations.

### Latency Under Pressure

`TestLatencyUnderPressure` measures end-to-end event delivery latency in a target room while all other rooms send concurrent traffic. Each room has 20 users; 200 messages are measured per level.

```bash
go test -v -run TestLatencyUnderPressure -timeout 300s
```

| Level | Sessions | Rooms | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| light | 50 | 5 | 27 us | 44 us | 880 us | 2.0 ms |
| medium | 400 | 20 | 80 us | 215 us | 270 us | 445 us |
| heavy | 1,000 | 50 | 69 us | 202 us | 339 us | 1.6 ms |
| extreme | 2,000 | 100 | 49 us | 65 us | 102 us | 226 us |

No latency decay as session count grows. Because broadcasts only touch the target room's members, cross-room pressure has negligible impact on delivery time.

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| [olahol/melody](https://github.com/olahol/melody) | v1.4.0 | WebSocket session management |
| [gorilla/websocket](https://github.com/gorilla/websocket) | v1.5.0 | WebSocket protocol (used by melody + tests) |
| [google/uuid](https://github.com/google/uuid) | v1.6.0 | Session ID generation |
| [nats-io/nats.go](https://github.com/nats-io/nats.go) | v1.49.0 | Cross-region federation pub/sub |

Max message size: **4096 bytes** (desktop), **512 bytes** (ping).
