# moodio-realtime

WebSocket server for real-time collaboration on Moodio desktops. Handles room-based presence, event broadcasting, and permission enforcement. Sits behind Nginx alongside the main Next.js app

## Architecture

```
Browser ──WebSocket──▶ Nginx (/ws/*) ──▶ Go realtime server (:8081)
Browser ──HTTP────────▶ Nginx (/*) ────▶ Next.js app (:3000)
```

The server uses [melody](https://github.com/olahol/melody) (a gorilla/websocket wrapper) for connection management. Rooms are managed via an in-memory index — each desktop ID maps to a set of WebSocket sessions. There is no external state (no Redis, no database).

### Files

| File | Purpose |
|---|---|
| `main.go` | HTTP server, route setup, WebSocket upgrade |
| `room.go` | Room manager, broadcast, event handling, permission checks |
| `auth.go` | JWT validation from cookie, permission API call, session ID generation |
| `room_test.go` | Functional and benchmark tests |
| `nginx.example.conf` | Example Nginx reverse proxy config |

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

## Running

```bash
JWT_ACCESS_SECRET=your-secret go run .
```

## Health Check

```
GET /health → 200 "ok"
```

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

All other clients in the room receive a `session_joined` event:

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

The server stamps the sender's identity and broadcasts to all other sessions in the same room:

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

When a session disconnects, the server broadcasts `session_left` to all remaining room members.

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
| `asset_selected` | Client → Server → room | Yes | No |
| `asset_deselected` | Client → Server → room | Yes | No |

### Permissions

- **editor** — can send all event types
- **viewer** — all mutation events are silently blocked server-side

Permission is checked once at connection time via the Next.js API and cached for the session lifetime.

## Room Model

Rooms are implicit — a room is the set of sessions sharing a `desktopId`. The `RoomManager` maintains an in-memory index (`map[roomId]set[*Session]`) for O(room-size) lookups and broadcasts. Empty rooms are garbage-collected automatically when the last session disconnects.

Messages are broadcast directly to room members, bypassing Melody's global `BroadcastFilter` to avoid iterating over sessions in unrelated rooms.

## Nginx Setup

See `nginx.example.conf` for routing `/ws/*` to this server and everything else to Next.js. Key settings:

- `proxy_http_version 1.1` + `Upgrade` / `Connection` headers for WebSocket
- `proxy_read_timeout 86400` to keep idle connections alive for 24h

## Tests

### Run All Tests

```bash
go test -v ./...
```

### Functional Tests

| Test | What it verifies |
|---|---|
| `TestRoomIsolation` | Events in room A don't reach room B; sender doesn't echo |
| `TestRoomIsolation_BidirectionalMultiRoom` | Two isolated rooms, neither leaks |
| `TestJoinEventsCorrectness` | `room_joined` lists existing sessions; `session_joined` broadcasts |
| `TestDisconnectBroadcast` | `session_left` fires on disconnect |
| `TestViewerCannotMutate` | All 7 mutation types blocked for viewers |
| `TestEditorCanMutate` | Editors can send mutations |
| `TestStampedIdentity` | Outgoing events have correct userId, firstName, timestamp |
| `TestManyRoomsIsolation` | 10 rooms, each receives only its own payloads |

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

Max message size: **4096 bytes**.
