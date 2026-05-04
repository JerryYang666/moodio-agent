import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getRealtimeClient,
  resetRealtimeClientForTests,
  type ConnectionState,
  type RemoteEvent,
  type RoomState,
  type TopicError,
} from "@/lib/realtime/client";

// ------------------------------------------------------------
// MockWebSocket — a zero-dep WebSocket stub that we drive from tests.
// ------------------------------------------------------------

type MockMessageHandler = (ev: { data: string }) => void;

class MockWebSocket {
  // Matches the real WebSocket ready states.
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;

  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: MockMessageHandler | null = null;

  sent: string[] = [];

  static instances: MockWebSocket[] = [];
  static last(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  simulateMessage(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  simulateRawMessage(raw: string) {
    this.onmessage?.({ data: raw });
  }
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    // Simulate close symmetrically — mirror what the browser does.
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  parsedSent(): any[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as any).WebSocket = MockWebSocket;
  (globalThis as any).window = { location: { hostname: "localhost" } };
  MockWebSocket.instances = [];
  resetRealtimeClientForTests();
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).WebSocket;
  delete (globalThis as any).window;
});

function newClient() {
  return getRealtimeClient({ wsUrl: "ws://mock" });
}

// Collects callback fires for later assertion.
function collector() {
  const events: RemoteEvent[] = [];
  const roomStates: RoomState[] = [];
  const connStates: ConnectionState[] = [];
  const errors: TopicError[] = [];
  return {
    handlers: {
      onEvent: (e: RemoteEvent) => {
        events.push(e);
      },
      onRoomState: (s: RoomState) => {
        roomStates.push(s);
      },
      onConnectionState: (s: ConnectionState) => {
        connStates.push(s);
      },
      onError: (e: TopicError) => {
        errors.push(e);
      },
    },
    events,
    roomStates,
    connStates,
    errors,
  };
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------

describe("RealtimeClient lifecycle", () => {
  it("lazy-connects on first subscribe", () => {
    const client = newClient();
    expect(MockWebSocket.instances.length).toBe(0);
    client.subscribe("desktop:a", collector().handlers);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.last().url).toBe("ws://mock/ws/connection");
  });

  it("sends subscribe op after open", () => {
    const client = newClient();
    client.subscribe("desktop:a", collector().handlers);
    MockWebSocket.last().simulateOpen();

    const sent = MockWebSocket.last().parsedSent();
    expect(sent.length).toBe(1);
    expect(sent[0].op).toBe("subscribe");
    expect(sent[0].topic).toBe("desktop:a");
    expect(typeof sent[0].ref).toBe("string");
  });

  it("auto-closes the socket when the last subscription goes away", () => {
    const client = newClient();
    const unsub = client.subscribe("desktop:a", collector().handlers);
    MockWebSocket.last().simulateOpen();
    expect(MockWebSocket.last().readyState).toBe(MockWebSocket.OPEN);

    unsub();

    // The client should send unsubscribe then close.
    const sent = MockWebSocket.last().parsedSent();
    expect(sent.some((m) => m.op === "unsubscribe" && m.topic === "desktop:a")).toBe(true);
    expect(MockWebSocket.last().readyState).toBe(MockWebSocket.CLOSED);
  });

  it("reopens on next subscribe after auto-close", () => {
    const client = newClient();
    const unsub = client.subscribe("desktop:a", collector().handlers);
    MockWebSocket.last().simulateOpen();
    unsub();

    client.subscribe("desktop:b", collector().handlers);
    expect(MockWebSocket.instances.length).toBe(2);
  });
});

// ------------------------------------------------------------
// Refcounting
// ------------------------------------------------------------

describe("RealtimeClient refcounting", () => {
  it("two handlers on the same topic share one wire subscription", () => {
    const client = newClient();
    const a = collector();
    const b = collector();
    const unsubA = client.subscribe("desktop:x", a.handlers);
    const unsubB = client.subscribe("desktop:x", b.handlers);

    MockWebSocket.last().simulateOpen();

    // Only one subscribe frame should go out.
    const sent = MockWebSocket.last().parsedSent();
    const subs = sent.filter((m) => m.op === "subscribe");
    expect(subs.length).toBe(1);

    // First unsubscribe does NOT send a wire unsubscribe.
    unsubA();
    const sent2 = MockWebSocket.last().parsedSent();
    expect(sent2.filter((m) => m.op === "unsubscribe").length).toBe(0);

    // Second unsubscribe does.
    unsubB();
    const sent3 = MockWebSocket.last().parsedSent();
    expect(sent3.filter((m) => m.op === "unsubscribe").length).toBe(1);
  });

  it("a second handler on an already-acked topic gets the cached room state", () => {
    const client = newClient();
    const a = collector();
    client.subscribe("desktop:x", a.handlers);
    MockWebSocket.last().simulateOpen();
    MockWebSocket.last().simulateMessage({
      op: "subscribed",
      topic: "desktop:x",
      permission: "editor",
      sessionId: "session_abc",
      sessions: [{ sessionId: "session_z", userId: "u2", firstName: "Z", email: "z@x", permission: "editor" }],
      ref: "c1",
    });
    expect(a.roomStates.length).toBe(1);

    const b = collector();
    client.subscribe("desktop:x", b.handlers);
    expect(b.roomStates.length).toBe(1);
    expect(b.roomStates[0].permission).toBe("editor");
    expect(b.roomStates[0].sessions[0].sessionId).toBe("session_z");
  });
});

// ------------------------------------------------------------
// Per-topic connection state
// ------------------------------------------------------------

describe("RealtimeClient per-topic state", () => {
  it("stays in connecting until the subscribed ack arrives", () => {
    const client = newClient();
    const c = collector();
    client.subscribe("desktop:x", c.handlers);
    MockWebSocket.last().simulateOpen();

    // Should still not be "connected" — we're waiting on the ack.
    expect(c.connStates.filter((s) => s === "connected").length).toBe(0);

    MockWebSocket.last().simulateMessage({
      op: "subscribed",
      topic: "desktop:x",
      permission: "editor",
      sessionId: "session_abc",
      sessions: [],
      ref: "c1",
    });

    expect(c.connStates).toContain("connected");
  });

  it("forbidden error flips the topic to disconnected with no retry", () => {
    const client = newClient();
    const c = collector();
    client.subscribe("desktop:x", c.handlers);
    MockWebSocket.last().simulateOpen();
    MockWebSocket.last().simulateMessage({
      op: "error",
      topic: "desktop:x",
      code: "forbidden",
      message: "no",
    });

    expect(c.errors.length).toBe(1);
    expect(c.connStates).toContain("disconnected");

    // Reconnect: the forbidden topic must NOT be resubscribed.
    MockWebSocket.last().simulateClose();
    vi.advanceTimersByTime(5000);
    MockWebSocket.last().simulateOpen();

    const sent = MockWebSocket.last().parsedSent();
    expect(sent.filter((m) => m.op === "subscribe").length).toBe(0);
  });
});

// ------------------------------------------------------------
// Reconnect
// ------------------------------------------------------------

describe("RealtimeClient reconnect", () => {
  it("resubscribes active topics after a dropped connection", () => {
    const client = newClient();
    const c = collector();
    client.subscribe("desktop:x", c.handlers);
    MockWebSocket.last().simulateOpen();
    MockWebSocket.last().simulateMessage({
      op: "subscribed",
      topic: "desktop:x",
      permission: "editor",
      sessionId: "session_1",
      sessions: [],
      ref: "c1",
    });
    const firstSocket = MockWebSocket.last();

    // Simulate a network blip.
    firstSocket.simulateClose();
    expect(c.connStates).toContain("reconnecting");

    // Advance past the backoff.
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);

    const secondSocket = MockWebSocket.last();
    secondSocket.simulateOpen();

    const sent = secondSocket.parsedSent();
    expect(sent.filter((m) => m.op === "subscribe" && m.topic === "desktop:x").length).toBe(1);
  });

  it("goes into polling state after exceeding reconnect attempts", () => {
    const client = newClient();
    const c = collector();
    client.subscribe("desktop:x", c.handlers);

    // Fail enough connects in a row to cross MAX_RECONNECT_BEFORE_POLLING (5).
    // Each close increments reconnectAttempts AFTER the branch check, so we
    // need 6 closes for attempts to reach 5 on entry.
    for (let i = 0; i < 6; i++) {
      MockWebSocket.last().simulateClose();
      vi.advanceTimersByTime(35000);
    }
    expect(c.connStates).toContain("polling");
  });
});

// ------------------------------------------------------------
// Events
// ------------------------------------------------------------

describe("RealtimeClient events", () => {
  function setupSubscribed(topic: string) {
    const client = newClient();
    const c = collector();
    client.subscribe(topic, c.handlers);
    MockWebSocket.last().simulateOpen();
    MockWebSocket.last().simulateMessage({
      op: "subscribed",
      topic,
      permission: "editor",
      sessionId: "session_me",
      sessions: [],
      ref: "c1",
    });
    return { client, c };
  }

  it("dispatches topic events to the right handler", () => {
    const { c } = setupSubscribed("desktop:x");
    MockWebSocket.last().simulateMessage({
      op: "event",
      topic: "desktop:x",
      type: "asset_moved",
      sessionId: "session_other",
      userId: "u2",
      firstName: "Bob",
      email: "b@x",
      timestamp: 1000,
      payload: { id: "a1", x: 10 },
    });
    expect(c.events.length).toBe(1);
    expect(c.events[0].type).toBe("asset_moved");
    expect(c.events[0].payload).toEqual({ id: "a1", x: 10 });
  });

  it("does not dispatch events for unrelated topics", () => {
    const { c } = setupSubscribed("desktop:x");
    MockWebSocket.last().simulateMessage({
      op: "event",
      topic: "desktop:y",
      type: "asset_moved",
      sessionId: "s",
      userId: "u",
      firstName: "",
      email: "",
      timestamp: 0,
      payload: {},
    });
    expect(c.events.length).toBe(0);
  });

  it("updates the cached session list on session_joined / session_left", () => {
    const { client, c } = setupSubscribed("desktop:x");

    MockWebSocket.last().simulateMessage({
      op: "event",
      topic: "desktop:x",
      type: "session_joined",
      sessionId: "session_alice",
      userId: "u-alice",
      firstName: "Alice",
      email: "a@x",
      timestamp: 1,
      payload: {
        sessionId: "session_alice",
        userId: "u-alice",
        firstName: "Alice",
        email: "a@x",
        permission: "editor",
      },
    });

    // A fresh handler subscribing next should see Alice in cached room state.
    const c2 = collector();
    client.subscribe("desktop:x", c2.handlers);
    expect(c2.roomStates[0].sessions.map((s) => s.sessionId)).toContain(
      "session_alice"
    );

    MockWebSocket.last().simulateMessage({
      op: "event",
      topic: "desktop:x",
      type: "session_left",
      sessionId: "session_alice",
      userId: "u-alice",
      firstName: "Alice",
      email: "a@x",
      timestamp: 2,
      payload: { sessionId: "session_alice" },
    });

    const c3 = collector();
    client.subscribe("desktop:x", c3.handlers);
    expect(c3.roomStates[0].sessions.map((s) => s.sessionId)).not.toContain(
      "session_alice"
    );

    // Ensure no type error — c is still attached.
    void c;
  });

  it("ignores malformed frames", () => {
    const { c } = setupSubscribed("desktop:x");
    MockWebSocket.last().simulateRawMessage("not json");
    expect(c.events.length).toBe(0);
  });
});

// ------------------------------------------------------------
// Publish
// ------------------------------------------------------------

describe("RealtimeClient publish", () => {
  it("sends publish frames with the correct envelope", () => {
    const client = newClient();
    client.subscribe("desktop:x", collector().handlers);
    MockWebSocket.last().simulateOpen();
    client.publish("desktop:x", "asset_moved", { id: "a1" });

    const last = MockWebSocket.last().parsedSent().pop();
    expect(last.op).toBe("publish");
    expect(last.topic).toBe("desktop:x");
    expect(last.type).toBe("asset_moved");
    expect(last.payload).toEqual({ id: "a1" });
  });

  it("silently drops publishes while disconnected", () => {
    const client = newClient();
    // No subscribe, no socket.
    client.publish("desktop:x", "asset_moved", { id: "a1" });
    expect(MockWebSocket.instances.length).toBe(0);
  });
});
