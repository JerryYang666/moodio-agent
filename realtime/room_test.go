package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/olahol/melody"
)

// ---------- test helpers ----------

// setupTestServer stands up a relay speaking the new /ws protocol. Identity
// is taken from request headers (X-User-Id / X-First-Name / X-Email /
// X-Permission) instead of a real JWT cookie. Authorization is stubbed: any
// topic is permitted; the permission returned equals the X-Permission header
// (default "editor").
func setupTestServer() (*melody.Melody, *RoomManager, *httptest.Server) {
	m := melody.New()
	m.Config.MaxMessageSize = 4096

	rooms := NewRoomManager(m)
	rooms.authorizeOverride = func(claims *Claims, topic string) (string, error) {
		perm := claims.LastName // abuse LastName to carry a per-test permission override
		if perm == "" {
			perm = "editor"
		}
		return perm, nil
	}

	m.HandleConnect(func(s *melody.Session) { rooms.HandleConnect(s) })
	m.HandleMessage(func(s *melody.Session, msg []byte) { rooms.HandleMessage(s, msg) })
	m.HandleDisconnect(func(s *melody.Session) { rooms.HandleDisconnect(s) })

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/connection", func(w http.ResponseWriter, r *http.Request) {
		userId := r.Header.Get("X-User-Id")
		firstName := r.Header.Get("X-First-Name")
		email := r.Header.Get("X-Email")
		permission := r.Header.Get("X-Permission")
		if permission == "" {
			permission = "editor"
		}

		claims := &Claims{
			UserID:    userId,
			Email:     email,
			FirstName: firstName,
			LastName:  permission, // carried through to authorizeOverride
		}
		sessionId := generateSessionId()
		m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId": sessionId,
			"claims":    claims,
		})
	})

	server := httptest.NewServer(mux)
	return m, rooms, server
}

type testClient struct {
	conn     *websocket.Conn
	messages []json.RawMessage
	mu       sync.Mutex
	done     chan struct{}
	// sessionID populated from the first "subscribed" ack.
	sessionID string
}

// dialRaw opens a connection to /ws with the given identity headers but does
// not subscribe to any topic. Use this + subscribe helpers for new multi-topic
// tests.
func dialRaw(t *testing.T, server *httptest.Server, userId, firstName, permission string) *testClient {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/connection"
	header := http.Header{}
	header.Set("X-User-Id", userId)
	header.Set("X-First-Name", firstName)
	header.Set("X-Email", firstName+"@test.com")
	if permission != "" {
		header.Set("X-Permission", permission)
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("failed to dial /ws: %v", err)
	}
	tc := &testClient{conn: conn, done: make(chan struct{})}
	go tc.readLoop()
	return tc
}

func (tc *testClient) readLoop() {
	defer close(tc.done)
	for {
		_, msg, err := tc.conn.ReadMessage()
		if err != nil {
			return
		}
		tc.mu.Lock()
		tc.messages = append(tc.messages, json.RawMessage(msg))
		tc.mu.Unlock()
	}
}

func (tc *testClient) sendRaw(t *testing.T, obj map[string]any) {
	t.Helper()
	data, err := json.Marshal(obj)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := tc.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write: %v", err)
	}
}

// subscribe sends a subscribe op and waits for the matching subscribed ack.
// Populates sessionID from the ack.
func (tc *testClient) subscribe(t *testing.T, topic string) {
	t.Helper()
	ref := "sub-" + topic + "-" + randSuffix()
	tc.sendRaw(t, map[string]any{"op": "subscribe", "topic": topic, "ref": ref})
	deadline := time.After(2 * time.Second)
	for {
		tc.mu.Lock()
		// scan all messages for a matching ack; don't consume unrelated ones
		for _, raw := range tc.messages {
			var env struct {
				Op        string `json:"op"`
				Topic     string `json:"topic"`
				Ref       string `json:"ref"`
				SessionID string `json:"sessionId"`
			}
			if json.Unmarshal(raw, &env) != nil {
				continue
			}
			if env.Op == "subscribed" && env.Topic == topic && env.Ref == ref {
				if tc.sessionID == "" {
					tc.sessionID = env.SessionID
				}
				tc.mu.Unlock()
				return
			}
			if env.Op == "error" && env.Ref == ref {
				tc.mu.Unlock()
				t.Fatalf("subscribe(%s) returned error: %s", topic, string(raw))
			}
		}
		tc.mu.Unlock()
		select {
		case <-deadline:
			t.Fatalf("timed out waiting for subscribed ack for %s", topic)
		case <-time.After(10 * time.Millisecond):
		}
	}
}

// subscribeExpectError sends a subscribe and waits for an error response.
// Returns the error code.
func (tc *testClient) subscribeExpectError(t *testing.T, topic string) string {
	t.Helper()
	ref := "sub-err-" + topic + "-" + randSuffix()
	tc.sendRaw(t, map[string]any{"op": "subscribe", "topic": topic, "ref": ref})
	deadline := time.After(2 * time.Second)
	for {
		tc.mu.Lock()
		for _, raw := range tc.messages {
			var env struct {
				Op   string `json:"op"`
				Ref  string `json:"ref"`
				Code string `json:"code"`
			}
			if json.Unmarshal(raw, &env) != nil {
				continue
			}
			if env.Ref == ref {
				tc.mu.Unlock()
				if env.Op == "error" {
					return env.Code
				}
				t.Fatalf("expected error for %s, got %s", topic, string(raw))
			}
		}
		tc.mu.Unlock()
		select {
		case <-deadline:
			t.Fatal("timed out waiting for error response")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func (tc *testClient) unsubscribe(t *testing.T, topic string) {
	t.Helper()
	ref := "unsub-" + topic + "-" + randSuffix()
	tc.sendRaw(t, map[string]any{"op": "unsubscribe", "topic": topic, "ref": ref})
}

// publish sends a publish op. Does not wait for anything (fire-and-forget).
func (tc *testClient) publish(t *testing.T, topic, eventType string, payload map[string]any) {
	t.Helper()
	tc.sendRaw(t, map[string]any{
		"op":      "publish",
		"topic":   topic,
		"type":    eventType,
		"payload": payload,
	})
}

// connectAndSubscribe is a convenience for tests that just want one client
// hooked up to one topic under the old single-room pattern.
func connectAndSubscribe(t *testing.T, server *httptest.Server, topic, userId, firstName, permission string) *testClient {
	t.Helper()
	tc := dialRaw(t, server, userId, firstName, permission)
	tc.subscribe(t, topic)
	return tc
}

// waitForMessages blocks until `count` messages have arrived or timeout.
// Returns the current message slice snapshot.
func (tc *testClient) waitForMessages(count int, timeout time.Duration) []json.RawMessage {
	deadline := time.After(timeout)
	for {
		tc.mu.Lock()
		n := len(tc.messages)
		tc.mu.Unlock()
		if n >= count {
			break
		}
		select {
		case <-deadline:
			tc.mu.Lock()
			defer tc.mu.Unlock()
			out := make([]json.RawMessage, len(tc.messages))
			copy(out, tc.messages)
			return out
		case <-time.After(10 * time.Millisecond):
		}
	}
	tc.mu.Lock()
	defer tc.mu.Unlock()
	out := make([]json.RawMessage, len(tc.messages))
	copy(out, tc.messages)
	return out
}

func (tc *testClient) close() {
	tc.conn.Close()
	<-tc.done
}

func (tc *testClient) clearMessages() {
	tc.mu.Lock()
	tc.messages = nil
	tc.mu.Unlock()
}

// parseEventType pulls "type" from any envelope (wire events, session events,
// and the legacy unwrapped format used by some federation paths).
func parseEventType(raw json.RawMessage) string {
	var e struct {
		Type string `json:"type"`
	}
	_ = json.Unmarshal(raw, &e)
	return e.Type
}

// findEventsOfType scans the client's messages for op:"event" frames whose
// type matches. Filters by topic if non-empty.
func (tc *testClient) findEventsOfType(eventType, topic string) []json.RawMessage {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	out := make([]json.RawMessage, 0)
	for _, raw := range tc.messages {
		var env struct {
			Op    string `json:"op"`
			Topic string `json:"topic"`
			Type  string `json:"type"`
		}
		if json.Unmarshal(raw, &env) != nil {
			continue
		}
		if env.Type != eventType {
			continue
		}
		if topic != "" && env.Topic != topic {
			continue
		}
		out = append(out, raw)
	}
	return out
}

func randSuffix() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// ---------- functional tests ----------

func TestSubscribe_Ack(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()
	c.subscribe(t, "desktop:abc")

	// The ack should include an empty sessions list because nobody else is here.
	msgs := c.waitForMessages(1, 500*time.Millisecond)
	if len(msgs) == 0 {
		t.Fatal("expected subscribed ack")
	}
	var ack SubscribedAck
	_ = json.Unmarshal(msgs[0], &ack)
	if ack.Op != "subscribed" {
		t.Fatalf("expected subscribed, got %s", ack.Op)
	}
	if ack.Permission != "editor" {
		t.Errorf("expected editor, got %s", ack.Permission)
	}
	if len(ack.Sessions) != 0 {
		t.Errorf("expected 0 existing sessions, got %d", len(ack.Sessions))
	}
	if ack.SessionID == "" {
		t.Error("ack should carry sessionId")
	}
}

func TestSubscribe_MultiTopicOneConnection(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	// Alice holds one connection subscribed to both desktop:A and
	// production-table:B.
	alice := dialRaw(t, server, "u1", "Alice", "editor")
	defer alice.close()
	alice.subscribe(t, "desktop:A")
	alice.subscribe(t, "production-table:B")

	// Bob is only on desktop:A. Carol is only on production-table:B.
	bob := connectAndSubscribe(t, server, "desktop:A", "u2", "Bob", "editor")
	defer bob.close()
	carol := connectAndSubscribe(t, server, "production-table:B", "u3", "Carol", "editor")
	defer carol.close()
	time.Sleep(50 * time.Millisecond)

	bob.clearMessages()
	carol.clearMessages()

	alice.publish(t, "desktop:A", "asset_moved", map[string]any{"id": "a1"})
	alice.publish(t, "production-table:B", "pt_cell_updated", map[string]any{"row": "r1"})

	time.Sleep(200 * time.Millisecond)

	if len(bob.findEventsOfType("asset_moved", "desktop:A")) == 0 {
		t.Error("bob should see asset_moved on desktop:A")
	}
	if len(bob.findEventsOfType("pt_cell_updated", "")) != 0 {
		t.Error("bob should not see production-table events")
	}
	if len(carol.findEventsOfType("pt_cell_updated", "production-table:B")) == 0 {
		t.Error("carol should see pt_cell_updated on production-table:B")
	}
	if len(carol.findEventsOfType("asset_moved", "")) != 0 {
		t.Error("carol should not see desktop events")
	}
}

func TestSubscribe_Forbidden(t *testing.T) {
	_, rooms, server := setupTestServer()
	defer server.Close()

	rooms.authorizeOverride = func(c *Claims, topic string) (string, error) {
		if topic == "desktop:denied" {
			return "", ErrTopicForbidden
		}
		return "editor", nil
	}

	c := dialRaw(t, server, "u1", "Alice", "")
	defer c.close()
	code := c.subscribeExpectError(t, "desktop:denied")
	if code != "forbidden" {
		t.Fatalf("expected forbidden, got %s", code)
	}

	// Verify no membership leaked.
	rooms.mu.RLock()
	_, present := rooms.topics["desktop:denied"]
	rooms.mu.RUnlock()
	if present {
		t.Error("denied topic should not have membership")
	}
}

func TestSubscribe_BadRequestForUnknownNamespace(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()
	code := c.subscribeExpectError(t, "nope:whatever")
	if code != "bad_request" {
		t.Fatalf("expected bad_request, got %s", code)
	}
}

func TestUnsubscribe_Leaves(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	alice := connectAndSubscribe(t, server, "desktop:A", "u1", "Alice", "editor")
	defer alice.close()
	bob := connectAndSubscribe(t, server, "desktop:A", "u2", "Bob", "editor")
	defer bob.close()
	time.Sleep(50 * time.Millisecond)

	bob.clearMessages()
	alice.unsubscribe(t, "desktop:A")
	time.Sleep(100 * time.Millisecond)

	leftEvents := bob.findEventsOfType("session_left", "desktop:A")
	if len(leftEvents) == 0 {
		t.Fatal("bob should see session_left when alice unsubscribes")
	}

	// After unsubscribe, alice's publishes should not be delivered on that topic.
	alice.publish(t, "desktop:A", "asset_moved", map[string]any{"id": "x"})
	time.Sleep(100 * time.Millisecond)
	if len(bob.findEventsOfType("asset_moved", "")) != 0 {
		t.Error("bob should not see publish from unsubscribed alice")
	}
}

func TestDisconnect_MultiTopicCleanup(t *testing.T) {
	_, rooms, server := setupTestServer()
	defer server.Close()

	alice := dialRaw(t, server, "u1", "Alice", "editor")
	alice.subscribe(t, "desktop:A")
	alice.subscribe(t, "desktop:B")
	alice.subscribe(t, "production-table:C")

	bob := connectAndSubscribe(t, server, "desktop:A", "u2", "Bob", "editor")
	defer bob.close()
	carol := connectAndSubscribe(t, server, "production-table:C", "u3", "Carol", "editor")
	defer carol.close()
	time.Sleep(50 * time.Millisecond)

	bob.clearMessages()
	carol.clearMessages()

	alice.close()
	time.Sleep(200 * time.Millisecond)

	if len(bob.findEventsOfType("session_left", "desktop:A")) == 0 {
		t.Error("bob should see session_left on desktop:A")
	}
	if len(carol.findEventsOfType("session_left", "production-table:C")) == 0 {
		t.Error("carol should see session_left on production-table:C")
	}

	// desktop:B had nobody but alice; its membership map entry should be gone.
	rooms.mu.RLock()
	_, present := rooms.topics["desktop:B"]
	rooms.mu.RUnlock()
	if present {
		t.Error("desktop:B should be cleaned up after alice disconnects")
	}
}

func TestViewer_PerTopic(t *testing.T) {
	_, rooms, server := setupTestServer()
	defer server.Close()

	// User is viewer on A, editor on B.
	rooms.authorizeOverride = func(c *Claims, topic string) (string, error) {
		if topic == "desktop:A" {
			return "viewer", nil
		}
		return "editor", nil
	}

	sender := dialRaw(t, server, "u1", "Alice", "")
	sender.subscribe(t, "desktop:A")
	sender.subscribe(t, "desktop:B")
	defer sender.close()

	rcvA := connectAndSubscribe(t, server, "desktop:A", "u2", "Rcv-A", "editor")
	defer rcvA.close()
	rcvB := connectAndSubscribe(t, server, "desktop:B", "u3", "Rcv-B", "editor")
	defer rcvB.close()
	time.Sleep(50 * time.Millisecond)

	rcvA.clearMessages()
	rcvB.clearMessages()

	sender.publish(t, "desktop:A", "asset_moved", map[string]any{"id": "x"})
	sender.publish(t, "desktop:B", "asset_moved", map[string]any{"id": "y"})
	time.Sleep(200 * time.Millisecond)

	if len(rcvA.findEventsOfType("asset_moved", "")) != 0 {
		t.Error("viewer mutation on A should be dropped")
	}
	if len(rcvB.findEventsOfType("asset_moved", "")) != 1 {
		t.Error("editor mutation on B should be delivered")
	}
}

func TestResubscribe_Idempotent(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	alice := connectAndSubscribe(t, server, "desktop:A", "u1", "Alice", "editor")
	defer alice.close()
	bob := connectAndSubscribe(t, server, "desktop:A", "u2", "Bob", "editor")
	defer bob.close()
	time.Sleep(50 * time.Millisecond)

	// Alice re-subscribes to the same topic. The second subscribe should
	// return a fresh ack but NOT broadcast another session_joined.
	alice.clearMessages()
	bob.clearMessages()
	alice.subscribe(t, "desktop:A")
	time.Sleep(100 * time.Millisecond)

	if len(bob.findEventsOfType("session_joined", "desktop:A")) != 0 {
		t.Error("resubscribe should not broadcast a new session_joined")
	}
}

func TestSubscribeStorm_RateLimited(t *testing.T) {
	_, rooms, server := setupTestServer()
	defer server.Close()

	// Drain the authorize cache so each subscribe does a fresh auth step.
	// The default stub always allows; rate limit is in SessionSubs itself.
	rooms.authorizeOverride = func(c *Claims, topic string) (string, error) {
		return "editor", nil
	}

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()

	// MaxSubscribeTokens == 20. Fire 30 unique subscribes; at least some
	// must get rate_limited.
	deniedCount := 0
	for i := 0; i < 30; i++ {
		ref := fmt.Sprintf("burst-%d", i)
		topic := fmt.Sprintf("desktop:t%02d", i)
		c.sendRaw(t, map[string]any{"op": "subscribe", "topic": topic, "ref": ref})
	}
	time.Sleep(300 * time.Millisecond)

	c.mu.Lock()
	defer c.mu.Unlock()
	for _, raw := range c.messages {
		var env struct {
			Op   string `json:"op"`
			Code string `json:"code"`
		}
		if json.Unmarshal(raw, &env) == nil && env.Op == "error" && env.Code == "rate_limited" {
			deniedCount++
		}
	}
	if deniedCount == 0 {
		t.Fatal("expected some subscribes to be rate-limited")
	}
}

func TestAuthorizeCache_HitAndInvalidate(t *testing.T) {
	_, rooms, server := setupTestServer()
	defer server.Close()

	var authCalls atomic.Int32
	rooms.authorizeOverride = func(c *Claims, topic string) (string, error) {
		authCalls.Add(1)
		return "editor", nil
	}

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()

	c.subscribe(t, "desktop:A")
	if got := authCalls.Load(); got != 1 {
		t.Fatalf("expected 1 auth call, got %d", got)
	}

	// Resubscribe (idempotent) should NOT hit authorize again.
	c.subscribe(t, "desktop:A")
	if got := authCalls.Load(); got != 1 {
		t.Fatalf("resubscribe should not call authorize, got %d", got)
	}

	// Unsubscribe invalidates the cache entry.
	c.unsubscribe(t, "desktop:A")
	time.Sleep(50 * time.Millisecond)

	// Subscribing again should re-authorize.
	c.subscribe(t, "desktop:A")
	if got := authCalls.Load(); got != 2 {
		t.Fatalf("expected second auth call after unsubscribe+resubscribe, got %d", got)
	}
}

// ---------- classic tests ported to new protocol ----------

func TestRoomIsolation(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	a1 := connectAndSubscribe(t, server, "desktop:room-a", "u1", "Alice", "editor")
	defer a1.close()
	a2 := connectAndSubscribe(t, server, "desktop:room-a", "u2", "Bob", "editor")
	defer a2.close()
	b1 := connectAndSubscribe(t, server, "desktop:room-b", "u3", "Charlie", "editor")
	defer b1.close()
	time.Sleep(50 * time.Millisecond)

	a1.clearMessages()
	a2.clearMessages()
	b1.clearMessages()

	a1.publish(t, "desktop:room-a", "asset_moved", map[string]any{"id": "asset-1", "x": 100})

	time.Sleep(200 * time.Millisecond)

	if len(a2.findEventsOfType("asset_moved", "desktop:room-a")) == 0 {
		t.Fatal("A2 in room-a should receive A1's message")
	}
	if len(b1.findEventsOfType("asset_moved", "")) != 0 {
		t.Error("B1 in room-b should not receive room-a messages")
	}
	if len(a1.findEventsOfType("asset_moved", "")) != 0 {
		t.Error("sender should not receive own message back")
	}
}

func TestJoinEventsCorrectness(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c1 := dialRaw(t, server, "u1", "Alice", "editor")
	defer c1.close()
	c1.subscribe(t, "desktop:join-test")

	// Alice ack should list 0 existing sessions.
	{
		msgs := c1.waitForMessages(1, 500*time.Millisecond)
		var ack SubscribedAck
		_ = json.Unmarshal(msgs[0], &ack)
		if len(ack.Sessions) != 0 {
			t.Fatalf("alice should see 0 existing sessions, got %d", len(ack.Sessions))
		}
	}

	c2 := dialRaw(t, server, "u2", "Bob", "editor")
	defer c2.close()
	c2.subscribe(t, "desktop:join-test")

	// Bob ack should list Alice.
	{
		msgs := c2.waitForMessages(1, 500*time.Millisecond)
		var ack SubscribedAck
		for _, raw := range msgs {
			var env struct{ Op string }
			_ = json.Unmarshal(raw, &env)
			if env.Op == "subscribed" {
				_ = json.Unmarshal(raw, &ack)
			}
		}
		if len(ack.Sessions) != 1 || ack.Sessions[0].FirstName != "Alice" {
			t.Fatalf("bob should see alice, got %+v", ack.Sessions)
		}
	}

	// Alice should also get a session_joined for Bob.
	time.Sleep(100 * time.Millisecond)
	if len(c1.findEventsOfType("session_joined", "desktop:join-test")) == 0 {
		t.Fatal("alice should receive session_joined for bob")
	}
}

func TestDisconnectBroadcast(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c1 := connectAndSubscribe(t, server, "desktop:disc", "u1", "Alice", "editor")
	defer c1.close()
	c2 := connectAndSubscribe(t, server, "desktop:disc", "u2", "Bob", "editor")
	time.Sleep(50 * time.Millisecond)
	c1.clearMessages()

	c2.close()
	time.Sleep(200 * time.Millisecond)

	if len(c1.findEventsOfType("session_left", "desktop:disc")) == 0 {
		t.Fatal("c1 should get session_left when c2 disconnects")
	}
}

func TestViewerCannotMutate(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	viewer := connectAndSubscribe(t, server, "desktop:perm", "u1", "Viewer", "viewer")
	defer viewer.close()
	editor := connectAndSubscribe(t, server, "desktop:perm", "u2", "Editor", "editor")
	defer editor.close()
	time.Sleep(50 * time.Millisecond)
	editor.clearMessages()

	mutations := []string{"asset_moved", "asset_resized", "asset_added", "asset_removed",
		"asset_dragging", "asset_resizing", "asset_selected", "asset_deselected"}
	for _, evt := range mutations {
		viewer.publish(t, "desktop:perm", evt, map[string]any{"id": "x"})
	}
	time.Sleep(300 * time.Millisecond)

	for _, evt := range mutations {
		if len(editor.findEventsOfType(evt, "")) != 0 {
			t.Errorf("viewer mutation %s should be blocked", evt)
		}
	}
}

func TestEditorCanMutate(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	editor := connectAndSubscribe(t, server, "desktop:editor", "u1", "Editor", "editor")
	defer editor.close()
	recv := connectAndSubscribe(t, server, "desktop:editor", "u2", "Recv", "editor")
	defer recv.close()
	time.Sleep(50 * time.Millisecond)
	recv.clearMessages()

	editor.publish(t, "desktop:editor", "asset_moved", map[string]any{"id": "a1"})
	time.Sleep(200 * time.Millisecond)
	if len(recv.findEventsOfType("asset_moved", "")) == 0 {
		t.Fatal("editor mutation should be forwarded")
	}
}

func TestStampedIdentity(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	sender := connectAndSubscribe(t, server, "desktop:stamp", "user-abc", "Alice", "editor")
	defer sender.close()
	recv := connectAndSubscribe(t, server, "desktop:stamp", "user-xyz", "Bob", "editor")
	defer recv.close()
	time.Sleep(50 * time.Millisecond)
	recv.clearMessages()

	sender.publish(t, "desktop:stamp", "asset_moved", map[string]any{"x": 10})
	msgs := recv.waitForMessages(1, 500*time.Millisecond)

	var stamped *TopicEvent
	for _, raw := range msgs {
		var peek struct {
			Op, Type string
		}
		_ = json.Unmarshal(raw, &peek)
		if peek.Op == "event" && peek.Type == "asset_moved" {
			stamped = &TopicEvent{}
			_ = json.Unmarshal(raw, stamped)
			break
		}
	}
	if stamped == nil {
		t.Fatal("expected stamped asset_moved event")
	}
	if stamped.UserID != "user-abc" {
		t.Errorf("expected userId user-abc, got %s", stamped.UserID)
	}
	if stamped.FirstName != "Alice" {
		t.Errorf("expected Alice, got %s", stamped.FirstName)
	}
	if stamped.Timestamp == 0 {
		t.Error("timestamp must be non-zero")
	}
}

func TestManyTopicsIsolation(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	const numRooms = 10
	type pair struct {
		sender   *testClient
		receiver *testClient
	}
	pairs := make([]pair, numRooms)
	for i := 0; i < numRooms; i++ {
		topic := fmt.Sprintf("desktop:room-%04d", i)
		s := connectAndSubscribe(t, server, topic, fmt.Sprintf("sender-%d", i), fmt.Sprintf("S%d", i), "editor")
		r := connectAndSubscribe(t, server, topic, fmt.Sprintf("recver-%d", i), fmt.Sprintf("R%d", i), "editor")
		r.clearMessages()
		pairs[i] = pair{sender: s, receiver: r}
	}
	defer func() {
		for _, p := range pairs {
			p.sender.close()
			p.receiver.close()
		}
	}()

	for i, p := range pairs {
		topic := fmt.Sprintf("desktop:room-%04d", i)
		p.sender.publish(t, topic, "asset_moved", map[string]any{"room": i})
	}
	time.Sleep(500 * time.Millisecond)

	for i, p := range pairs {
		events := p.receiver.findEventsOfType("asset_moved", "")
		if len(events) != 1 {
			t.Errorf("room %d: expected 1 event, got %d", i, len(events))
			continue
		}
		var evt TopicEvent
		_ = json.Unmarshal(events[0], &evt)
		payload, _ := json.Marshal(evt.Payload)
		if !strings.Contains(string(payload), fmt.Sprintf(`"room":%d`, i)) {
			t.Errorf("room %d: wrong payload %s", i, payload)
		}
	}
}

// ---------- benchmarks ----------

type benchClient struct {
	conn *websocket.Conn
}

// dialAndSubscribeBench is a lightweight dial+subscribe that does not
// care about maintaining a message buffer; it just drains.
func dialAndSubscribeBench(b *testing.B, server *httptest.Server, topic, userId, firstName string, received *atomic.Int64) *websocket.Conn {
	b.Helper()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/connection"
	header := http.Header{}
	header.Set("X-User-Id", userId)
	header.Set("X-First-Name", firstName)
	header.Set("X-Email", firstName+"@t.com")
	header.Set("X-Permission", "editor")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		b.Fatal(err)
	}
	// Send subscribe and drain the ack inline.
	subMsg, _ := json.Marshal(map[string]any{"op": "subscribe", "topic": topic, "ref": "b"})
	if err := conn.WriteMessage(websocket.TextMessage, subMsg); err != nil {
		b.Fatal(err)
	}
	// Reader goroutine: count non-ack event frames into `received`.
	go func() {
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var env struct{ Op string }
			if json.Unmarshal(raw, &env) == nil && env.Op == "event" {
				if received != nil {
					received.Add(1)
				}
			}
		}
	}()
	return conn
}

func BenchmarkBroadcastSameTopic(b *testing.B) {
	_, _, server := setupTestServer()
	defer server.Close()

	const numClients = 20
	var received atomic.Int64
	clients := make([]*websocket.Conn, numClients)
	for i := 0; i < numClients; i++ {
		clients[i] = dialAndSubscribeBench(b, server, "desktop:bench", fmt.Sprintf("u%d", i), fmt.Sprintf("U%d", i), &received)
	}
	time.Sleep(300 * time.Millisecond)
	received.Store(0)

	msg, _ := json.Marshal(map[string]any{
		"op": "publish", "topic": "desktop:bench", "type": "asset_dragging",
		"payload": map[string]any{"x": 1, "y": 2},
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		clients[0].WriteMessage(websocket.TextMessage, msg)
	}
	expected := int64(b.N) * int64(numClients-1)
	deadline := time.After(10 * time.Second)
	for received.Load() < expected {
		select {
		case <-deadline:
			b.Logf("timeout: %d/%d", received.Load(), expected)
			goto done
		case <-time.After(time.Millisecond):
		}
	}
done:
	b.StopTimer()
	b.ReportMetric(float64(received.Load())/float64(b.N), "deliveries/op")

	for _, c := range clients {
		c.Close()
	}
}

func BenchmarkBroadcastManyTopics(b *testing.B) {
	_, _, server := setupTestServer()
	defer server.Close()

	const numRooms = 50
	const usersPerRoom = 5

	var received atomic.Int64
	senders := make([]*websocket.Conn, numRooms)
	var allConns []*websocket.Conn

	for r := 0; r < numRooms; r++ {
		topic := fmt.Sprintf("desktop:room-%04d", r)
		for u := 0; u < usersPerRoom; u++ {
			conn := dialAndSubscribeBench(b, server, topic, fmt.Sprintf("u%d-%d", r, u), fmt.Sprintf("U%d_%d", r, u), &received)
			allConns = append(allConns, conn)
			if u == 0 {
				senders[r] = conn
			}
		}
	}
	time.Sleep(500 * time.Millisecond)
	received.Store(0)

	msg := func(topic string) []byte {
		m, _ := json.Marshal(map[string]any{
			"op": "publish", "topic": topic, "type": "asset_dragging",
			"payload": map[string]any{"x": 1},
		})
		return m
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		roomIdx := i % numRooms
		senders[roomIdx].WriteMessage(websocket.TextMessage, msg(fmt.Sprintf("desktop:room-%04d", roomIdx)))
	}

	expectedPerMsg := int64(usersPerRoom - 1)
	expected := int64(b.N) * expectedPerMsg
	deadline := time.After(15 * time.Second)
	for received.Load() < expected {
		select {
		case <-deadline:
			b.Logf("timeout: %d/%d", received.Load(), expected)
			goto done2
		case <-time.After(time.Millisecond):
		}
	}
done2:
	b.StopTimer()
	b.ReportMetric(float64(received.Load())/float64(b.N), "deliveries/op")

	for _, c := range allConns {
		c.Close()
	}
}

func BenchmarkGetSessionsInTopic(b *testing.B) {
	_, rooms, server := setupTestServer()
	defer server.Close()

	const numRooms = 50
	const usersPerRoom = 10
	for r := 0; r < numRooms; r++ {
		topic := fmt.Sprintf("desktop:room-%d", r)
		for u := 0; u < usersPerRoom; u++ {
			dialAndSubscribeBench(b, server, topic, fmt.Sprintf("u%d-%d", r, u), "U", nil)
		}
	}
	time.Sleep(500 * time.Millisecond)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rooms.getSessionsInTopic("desktop:room-0", "")
	}
}

// ---------- latency under pressure ----------

func percentile(sorted []time.Duration, pct float64) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(float64(len(sorted)-1) * pct)
	return sorted[idx]
}

const pressureLevelsEnvKey = "MOODIO_PRESSURE_LEVELS"

func enabledPressureLevels() map[string]bool {
	defaults := map[string]bool{"light": true, "medium": true}
	raw := strings.TrimSpace(os.Getenv(pressureLevelsEnvKey))
	if raw == "" {
		return defaults
	}
	if strings.EqualFold(raw, "all") {
		return map[string]bool{"light": true, "medium": true, "heavy": true, "extreme": true}
	}
	known := map[string]struct{}{"light": {}, "medium": {}, "heavy": {}, "extreme": {}}
	out := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		lvl := strings.ToLower(strings.TrimSpace(part))
		if _, ok := known[lvl]; ok {
			out[lvl] = true
		}
	}
	if len(out) == 0 {
		return defaults
	}
	return out
}

// TestLatencyUnderPressure measures target-room latency while many background
// rooms hammer the relay with pressure events.
func TestLatencyUnderPressure(t *testing.T) {
	log.SetOutput(io.Discard)
	defer log.SetOutput(os.Stderr)

	levels := []struct {
		label        string
		numRooms     int
		usersPerRoom int
	}{
		{"light", 5, 10},
		{"medium", 20, 10},
		{"heavy", 50, 10},
		{"extreme", 100, 10},
	}

	const (
		messagesPerLevel = 300
		pressureInterval = 2 * time.Millisecond
		measureInterval  = 10 * time.Millisecond
	)

	t.Logf("GOMAXPROCS=%d  NumCPU=%d", runtime.GOMAXPROCS(0), runtime.NumCPU())
	enabled := enabledPressureLevels()
	t.Logf("pressure levels enabled: %v (set %s=all to run all)", enabled, pressureLevelsEnvKey)

	for _, level := range levels {
		t.Run(level.label, func(t *testing.T) {
			if !enabled[level.label] {
				t.Skipf("skipped; set %s=%s or all", pressureLevelsEnvKey, level.label)
			}

			_, _, server := setupTestServer()
			defer server.Close()

			type roomClients struct {
				sender    *websocket.Conn
				receivers []*websocket.Conn
			}

			type measuredReceiver struct {
				conn *websocket.Conn
				ch   chan json.RawMessage
				done chan struct{}
			}
			newMR := func(c *websocket.Conn) *measuredReceiver {
				mr := &measuredReceiver{conn: c, ch: make(chan json.RawMessage, 512), done: make(chan struct{})}
				go func() {
					defer close(mr.done)
					for {
						_, raw, err := c.ReadMessage()
						if err != nil {
							return
						}
						select {
						case mr.ch <- json.RawMessage(raw):
						default:
						}
					}
				}()
				return mr
			}

			dialSubscribed := func(topic, userId, firstName string) *websocket.Conn {
				wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/connection"
				header := http.Header{}
				header.Set("X-User-Id", userId)
				header.Set("X-First-Name", firstName)
				header.Set("X-Email", firstName+"@t.com")
				header.Set("X-Permission", "editor")
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
				if err != nil {
					t.Fatal(err)
				}
				sub, _ := json.Marshal(map[string]any{"op": "subscribe", "topic": topic, "ref": "r"})
				conn.WriteMessage(websocket.TextMessage, sub)
				return conn
			}

			allRooms := make([]roomClients, level.numRooms)
			var allConns []*websocket.Conn
			var targetReceivers []*measuredReceiver

			for r := 0; r < level.numRooms; r++ {
				topic := fmt.Sprintf("desktop:room-%04d", r)
				rc := roomClients{}
				for u := 0; u < level.usersPerRoom; u++ {
					conn := dialSubscribed(topic, fmt.Sprintf("u%d-%d", r, u), fmt.Sprintf("U%d_%d", r, u))
					allConns = append(allConns, conn)
					if u == 0 {
						rc.sender = conn
					} else {
						rc.receivers = append(rc.receivers, conn)
						if r == 0 {
							targetReceivers = append(targetReceivers, newMR(conn))
						}
					}
				}
				allRooms[r] = rc
			}

			time.Sleep(800 * time.Millisecond)
			for _, mr := range targetReceivers {
			drain:
				for {
					select {
					case <-mr.ch:
					default:
						break drain
					}
				}
			}
			for r := 1; r < level.numRooms; r++ {
				for _, recv := range allRooms[r].receivers {
					recv.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
					for {
						if _, _, err := recv.ReadMessage(); err != nil {
							break
						}
					}
					recv.SetReadDeadline(time.Time{})
				}
			}

			stopPressure := make(chan struct{})
			var pressureSent atomic.Int64
			var pressureWg sync.WaitGroup

			pressureMsgFor := func(topic string) []byte {
				m, _ := json.Marshal(map[string]any{
					"op": "publish", "topic": topic, "type": "asset_dragging",
					"payload": map[string]any{"x": 1, "y": 2},
				})
				return m
			}

			for r := 1; r < level.numRooms; r++ {
				topic := fmt.Sprintf("desktop:room-%04d", r)
				msg := pressureMsgFor(topic)
				pressureWg.Add(1)
				go func(sender *websocket.Conn, m []byte) {
					defer pressureWg.Done()
					defer func() { recover() }()
					for {
						select {
						case <-stopPressure:
							return
						default:
						}
						if err := sender.WriteMessage(websocket.TextMessage, m); err != nil {
							return
						}
						pressureSent.Add(1)
						time.Sleep(pressureInterval)
					}
				}(allRooms[r].sender, msg)
			}

			for r := 1; r < level.numRooms; r++ {
				for _, recv := range allRooms[r].receivers {
					pressureWg.Add(1)
					go func(c *websocket.Conn) {
						defer pressureWg.Done()
						defer func() { recover() }()
						for {
							c.SetReadDeadline(time.Now().Add(3 * time.Second))
							if _, _, err := c.ReadMessage(); err != nil {
								select {
								case <-stopPressure:
									return
								default:
								}
								return
							}
						}
					}(recv)
				}
			}

			time.Sleep(200 * time.Millisecond)

			numReceivers := len(targetReceivers)
			latencies := make([]time.Duration, 0, messagesPerLevel)
			var delivered atomic.Int64
			var failed atomic.Int64
			expectedTotal := int64(messagesPerLevel) * int64(numReceivers)

			targetTopic := "desktop:room-0000"

			for i := 0; i < messagesPerLevel; i++ {
				msg, _ := json.Marshal(map[string]any{
					"op": "publish", "topic": targetTopic, "type": "asset_moved",
					"payload": map[string]any{"seq": i},
				})

				start := time.Now()
				allRooms[0].sender.WriteMessage(websocket.TextMessage, msg)

				var wg sync.WaitGroup
				for _, mr := range targetReceivers {
					wg.Add(1)
					go func(mr *measuredReceiver) {
						defer wg.Done()
						timeout := time.After(5 * time.Second)
						for {
							select {
							case raw := <-mr.ch:
								var evt struct{ Type string }
								json.Unmarshal(raw, &evt)
								if evt.Type == "asset_moved" {
									delivered.Add(1)
									return
								}
							case <-timeout:
								failed.Add(1)
								return
							}
						}
					}(mr)
				}
				wg.Wait()
				latencies = append(latencies, time.Since(start))
				time.Sleep(measureInterval)
			}

			close(stopPressure)
			pressureWg.Wait()

			for _, c := range allConns {
				c.Close()
			}
			for _, mr := range targetReceivers {
				<-mr.done
			}

			sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
			successRate := float64(delivered.Load()) / float64(expectedTotal) * 100
			pressureRate := float64(pressureSent.Load()) / latencies[len(latencies)-1].Seconds()

			t.Logf("=== %s: %d sessions across %d rooms ===", level.label, level.numRooms*level.usersPerRoom, level.numRooms)
			t.Logf("  GOMAXPROCS:     %d", runtime.GOMAXPROCS(0))
			t.Logf("  receivers/room: %d", numReceivers)
			t.Logf("  messages sent:  %d", messagesPerLevel)
			t.Logf("  delivered:      %d / %d (%.2f%%)", delivered.Load(), expectedTotal, successRate)
			t.Logf("  failed:         %d", failed.Load())
			t.Logf("  pressure msgs:  %d (~%.0f msg/s across %d senders)", pressureSent.Load(), pressureRate, level.numRooms-1)
			t.Logf("  p50/p95/p99/max: %v / %v / %v / %v",
				percentile(latencies, 0.50), percentile(latencies, 0.95),
				percentile(latencies, 0.99), percentile(latencies, 1.0))
		})
	}
}
