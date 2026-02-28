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

func setupTestServer() (*melody.Melody, *RoomManager, *httptest.Server) {
	m := melody.New()
	m.Config.MaxMessageSize = 4096

	rooms := NewRoomManager(m)

	m.HandleConnect(func(s *melody.Session) {
		rooms.HandleConnect(s)
	})
	m.HandleMessage(func(s *melody.Session, msg []byte) {
		rooms.HandleMessage(s, msg)
	})
	m.HandleDisconnect(func(s *melody.Session) {
		rooms.HandleDisconnect(s)
	})

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/desktop/{desktopId}", func(w http.ResponseWriter, r *http.Request) {
		desktopId := r.PathValue("desktopId")
		userId := r.Header.Get("X-User-Id")
		firstName := r.Header.Get("X-First-Name")
		email := r.Header.Get("X-Email")
		permission := r.Header.Get("X-Permission")
		if permission == "" {
			permission = "editor"
		}

		sessionId := generateSessionId()

		m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId":  sessionId,
			"userId":     userId,
			"firstName":  firstName,
			"email":      email,
			"permission": permission,
			"roomId":     desktopId,
		})
	})

	server := httptest.NewServer(mux)
	return m, rooms, server
}

type testClient struct {
	conn      *websocket.Conn
	messages  []json.RawMessage
	mu        sync.Mutex
	done      chan struct{}
	sessionID string
}

func connectClient(t *testing.T, server *httptest.Server, roomId, userId, firstName, permission string) *testClient {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/desktop/" + roomId
	header := http.Header{}
	header.Set("X-User-Id", userId)
	header.Set("X-First-Name", firstName)
	header.Set("X-Email", firstName+"@test.com")
	if permission != "" {
		header.Set("X-Permission", permission)
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("failed to connect client %s to room %s: %v", firstName, roomId, err)
	}

	tc := &testClient{
		conn: conn,
		done: make(chan struct{}),
	}

	go func() {
		defer close(tc.done)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			tc.mu.Lock()
			tc.messages = append(tc.messages, json.RawMessage(msg))
			tc.mu.Unlock()
		}
	}()

	return tc
}

func (tc *testClient) send(t *testing.T, event map[string]any) {
	t.Helper()
	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("failed to marshal event: %v", err)
	}
	if err := tc.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("failed to send message: %v", err)
	}
}

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
			return tc.messages
		case <-time.After(10 * time.Millisecond):
		}
	}
	tc.mu.Lock()
	defer tc.mu.Unlock()
	return tc.messages
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

func parseEventType(raw json.RawMessage) string {
	var e struct {
		Type string `json:"type"`
	}
	json.Unmarshal(raw, &e)
	return e.Type
}

// ---------- functional tests ----------

func TestRoomIsolation(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	clientA1 := connectClient(t, server, "room-aaaa", "user1", "Alice", "editor")
	defer clientA1.close()
	time.Sleep(50 * time.Millisecond)

	clientA2 := connectClient(t, server, "room-aaaa", "user2", "Bob", "editor")
	defer clientA2.close()
	time.Sleep(50 * time.Millisecond)

	clientB1 := connectClient(t, server, "room-bbbb", "user3", "Charlie", "editor")
	defer clientB1.close()
	time.Sleep(50 * time.Millisecond)

	// Clear all initial join/session messages
	clientA1.clearMessages()
	clientA2.clearMessages()
	clientB1.clearMessages()

	clientA1.send(t, map[string]any{
		"type":    "asset_moved",
		"payload": map[string]any{"id": "asset-1", "x": 100, "y": 200},
	})

	// A2 should get the message (same room)
	msgsA2 := clientA2.waitForMessages(1, 500*time.Millisecond)
	if len(msgsA2) == 0 {
		t.Fatal("client A2 in room-a should have received the message from A1")
	}
	eventType := parseEventType(msgsA2[0])
	if eventType != "asset_moved" {
		t.Fatalf("expected asset_moved, got %s", eventType)
	}

	// B1 should NOT get the message (different room)
	time.Sleep(200 * time.Millisecond)
	clientB1.mu.Lock()
	msgsB1 := clientB1.messages
	clientB1.mu.Unlock()
	if len(msgsB1) > 0 {
		t.Fatalf("client B1 in room-b should NOT have received messages from room-a, got %d messages", len(msgsB1))
	}

	// A1 (the sender) should NOT get their own message back
	clientA1.mu.Lock()
	msgsA1 := clientA1.messages
	clientA1.mu.Unlock()
	if len(msgsA1) > 0 {
		t.Fatalf("sender A1 should NOT receive their own message back, got %d messages", len(msgsA1))
	}
}

func TestRoomIsolation_BidirectionalMultiRoom(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	clientA := connectClient(t, server, "room-xxxx", "user1", "Alice", "editor")
	defer clientA.close()

	clientB := connectClient(t, server, "room-yyyy", "user2", "Bob", "editor")
	defer clientB.close()

	time.Sleep(50 * time.Millisecond)
	clientA.clearMessages()
	clientB.clearMessages()

	// Send from room-x
	clientA.send(t, map[string]any{"type": "asset_added", "payload": map[string]any{"from": "room-xxxx"}})
	time.Sleep(200 * time.Millisecond)

	// Send from room-y
	clientB.send(t, map[string]any{"type": "asset_removed", "payload": map[string]any{"from": "room-yyyy"}})
	time.Sleep(200 * time.Millisecond)

	clientA.mu.Lock()
	aCount := len(clientA.messages)
	clientA.mu.Unlock()
	clientB.mu.Lock()
	bCount := len(clientB.messages)
	clientB.mu.Unlock()

	if aCount != 0 {
		t.Errorf("Alice (only user in room-xxxx) should receive 0 messages, got %d", aCount)
	}
	if bCount != 0 {
		t.Errorf("Bob (only user in room-yyyy) should receive 0 messages, got %d", bCount)
	}
}

func TestJoinEventsCorrectness(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c1 := connectClient(t, server, "room-join-test", "user1", "Alice", "editor")
	defer c1.close()
	// c1 gets room_joined (with 0 existing sessions)
	msgs := c1.waitForMessages(1, 500*time.Millisecond)
	if len(msgs) < 1 {
		t.Fatal("c1 should receive room_joined")
	}
	if parseEventType(msgs[0]) != "room_joined" {
		t.Fatalf("c1 first message should be room_joined, got %s", parseEventType(msgs[0]))
	}

	var joinEvent RoomJoinedEvent
	json.Unmarshal(msgs[0], &joinEvent)
	if len(joinEvent.Sessions) != 0 {
		t.Fatalf("first user should see 0 existing sessions, got %d", len(joinEvent.Sessions))
	}

	c2 := connectClient(t, server, "room-join-test", "user2", "Bob", "editor")
	defer c2.close()

	// c2 gets room_joined (with 1 existing session = Alice)
	msgs2 := c2.waitForMessages(1, 500*time.Millisecond)
	if len(msgs2) < 1 {
		t.Fatal("c2 should receive room_joined")
	}
	var joinEvent2 RoomJoinedEvent
	json.Unmarshal(msgs2[0], &joinEvent2)
	if len(joinEvent2.Sessions) != 1 {
		t.Fatalf("second user should see 1 existing session, got %d", len(joinEvent2.Sessions))
	}
	if joinEvent2.Sessions[0].FirstName != "Alice" {
		t.Fatalf("existing session should be Alice, got %s", joinEvent2.Sessions[0].FirstName)
	}

	// c1 should get a session_joined for Bob
	msgsC1 := c1.waitForMessages(2, 500*time.Millisecond)
	found := false
	for _, m := range msgsC1 {
		if parseEventType(m) == "session_joined" {
			var out OutgoingEvent
			json.Unmarshal(m, &out)
			if out.FirstName == "Bob" {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("c1 should have received session_joined for Bob")
	}
}

func TestDisconnectBroadcast(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c1 := connectClient(t, server, "room-disconnect", "user1", "Alice", "editor")
	defer c1.close()
	time.Sleep(50 * time.Millisecond)

	c2 := connectClient(t, server, "room-disconnect", "user2", "Bob", "editor")
	time.Sleep(50 * time.Millisecond)

	c1.clearMessages()

	c2.close()
	time.Sleep(200 * time.Millisecond)

	msgs := c1.waitForMessages(1, 500*time.Millisecond)
	found := false
	for _, m := range msgs {
		if parseEventType(m) == "session_left" {
			found = true
		}
	}
	if !found {
		t.Fatal("c1 should have received session_left when c2 disconnected")
	}
}

func TestViewerCannotMutate(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	viewer := connectClient(t, server, "room-permission", "user1", "Viewer", "viewer")
	defer viewer.close()
	time.Sleep(50 * time.Millisecond)

	editor := connectClient(t, server, "room-permission", "user2", "Editor", "editor")
	defer editor.close()
	time.Sleep(50 * time.Millisecond)
	editor.clearMessages()

	mutationEvents := []string{"asset_moved", "asset_resized", "asset_added", "asset_removed", "asset_dragging", "asset_selected", "asset_deselected"}
	for _, evt := range mutationEvents {
		viewer.send(t, map[string]any{"type": evt, "payload": map[string]any{"id": "x"}})
	}
	time.Sleep(300 * time.Millisecond)

	editor.mu.Lock()
	editorMsgs := len(editor.messages)
	editor.mu.Unlock()
	if editorMsgs > 0 {
		t.Fatalf("viewer mutations should be blocked, but editor received %d messages", editorMsgs)
	}
}

func TestEditorCanMutate(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	editor := connectClient(t, server, "room-editor-test", "user1", "Editor", "editor")
	defer editor.close()
	time.Sleep(50 * time.Millisecond)

	receiver := connectClient(t, server, "room-editor-test", "user2", "Receiver", "editor")
	defer receiver.close()
	time.Sleep(50 * time.Millisecond)
	receiver.clearMessages()

	editor.send(t, map[string]any{"type": "asset_moved", "payload": map[string]any{"id": "a1"}})

	msgs := receiver.waitForMessages(1, 500*time.Millisecond)
	if len(msgs) == 0 {
		t.Fatal("editor's mutation should be forwarded to other session")
	}
	if parseEventType(msgs[0]) != "asset_moved" {
		t.Fatalf("expected asset_moved, got %s", parseEventType(msgs[0]))
	}
}

func TestStampedIdentity(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	sender := connectClient(t, server, "room-stamped", "user-abc", "Alice", "editor")
	defer sender.close()
	time.Sleep(50 * time.Millisecond)

	receiver := connectClient(t, server, "room-stamped", "user-xyz", "Bob", "editor")
	defer receiver.close()
	time.Sleep(50 * time.Millisecond)
	receiver.clearMessages()

	sender.send(t, map[string]any{"type": "asset_moved", "payload": map[string]any{"x": 10}})

	msgs := receiver.waitForMessages(1, 500*time.Millisecond)
	if len(msgs) == 0 {
		t.Fatal("receiver should get stamped message")
	}

	var out OutgoingEvent
	json.Unmarshal(msgs[0], &out)
	if out.UserID != "user-abc" {
		t.Errorf("stamped userId should be user-abc, got %s", out.UserID)
	}
	if out.FirstName != "Alice" {
		t.Errorf("stamped firstName should be Alice, got %s", out.FirstName)
	}
	if out.Timestamp == 0 {
		t.Error("stamped timestamp should be non-zero")
	}
}

func TestManyRoomsIsolation(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	const numRooms = 10
	type roomPair struct {
		sender   *testClient
		receiver *testClient
	}
	pairs := make([]roomPair, numRooms)
	for i := 0; i < numRooms; i++ {
		roomId := fmt.Sprintf("room-%04d", i)
		s := connectClient(t, server, roomId, fmt.Sprintf("sender-%d", i), fmt.Sprintf("S%d", i), "editor")
		time.Sleep(20 * time.Millisecond)
		r := connectClient(t, server, roomId, fmt.Sprintf("recver-%d", i), fmt.Sprintf("R%d", i), "editor")
		time.Sleep(20 * time.Millisecond)
		r.clearMessages()
		pairs[i] = roomPair{sender: s, receiver: r}
	}
	defer func() {
		for _, p := range pairs {
			p.sender.close()
			p.receiver.close()
		}
	}()

	for i, p := range pairs {
		p.sender.send(t, map[string]any{
			"type":    "asset_moved",
			"payload": map[string]any{"room": i},
		})
	}

	time.Sleep(500 * time.Millisecond)

	for i, p := range pairs {
		msgs := p.receiver.waitForMessages(1, 200*time.Millisecond)
		if len(msgs) != 1 {
			t.Errorf("room-%04d receiver expected exactly 1 message, got %d", i, len(msgs))
			continue
		}
		var out OutgoingEvent
		json.Unmarshal(msgs[0], &out)
		payload, _ := json.Marshal(out.Payload)
		if !strings.Contains(string(payload), fmt.Sprintf(`"room":%d`, i)) {
			t.Errorf("room-%04d received wrong payload: %s", i, string(payload))
		}
	}
}

// ---------- benchmarks ----------

func BenchmarkBroadcastSameRoom(b *testing.B) {
	m := melody.New()
	m.Config.MaxMessageSize = 4096
	rooms := NewRoomManager(m)

	m.HandleConnect(func(s *melody.Session) { rooms.HandleConnect(s) })
	m.HandleMessage(func(s *melody.Session, msg []byte) { rooms.HandleMessage(s, msg) })
	m.HandleDisconnect(func(s *melody.Session) { rooms.HandleDisconnect(s) })

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/desktop/{desktopId}", func(w http.ResponseWriter, r *http.Request) {
		desktopId := r.PathValue("desktopId")
		m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId":  generateSessionId(),
			"userId":     r.Header.Get("X-User-Id"),
			"firstName":  r.Header.Get("X-First-Name"),
			"email":      r.Header.Get("X-Email"),
			"permission": "editor",
			"roomId":     desktopId,
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	const numClients = 20
	var received atomic.Int64
	clients := make([]*websocket.Conn, numClients)
	for i := 0; i < numClients; i++ {
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/desktop/bench-room-test"
		header := http.Header{}
		header.Set("X-User-Id", fmt.Sprintf("u%d", i))
		header.Set("X-First-Name", fmt.Sprintf("User%d", i))
		header.Set("X-Email", fmt.Sprintf("u%d@test.com", i))
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
		if err != nil {
			b.Fatalf("dial error: %v", err)
		}
		clients[i] = conn
		go func(c *websocket.Conn) {
			for {
				_, _, err := c.ReadMessage()
				if err != nil {
					return
				}
				received.Add(1)
			}
		}(conn)
	}
	time.Sleep(100 * time.Millisecond)

	msg, _ := json.Marshal(map[string]any{"type": "asset_dragging", "payload": map[string]any{"x": 1, "y": 2}})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		clients[0].WriteMessage(websocket.TextMessage, msg)
	}
	// Wait for in-flight messages
	expected := int64(b.N) * int64(numClients-1)
	deadline := time.After(10 * time.Second)
	for received.Load() < expected {
		select {
		case <-deadline:
			b.Logf("timeout: received %d/%d", received.Load(), expected)
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

func BenchmarkBroadcastManyRooms(b *testing.B) {
	m := melody.New()
	m.Config.MaxMessageSize = 4096
	rooms := NewRoomManager(m)

	m.HandleConnect(func(s *melody.Session) { rooms.HandleConnect(s) })
	m.HandleMessage(func(s *melody.Session, msg []byte) { rooms.HandleMessage(s, msg) })
	m.HandleDisconnect(func(s *melody.Session) { rooms.HandleDisconnect(s) })

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/desktop/{desktopId}", func(w http.ResponseWriter, r *http.Request) {
		desktopId := r.PathValue("desktopId")
		m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId":  generateSessionId(),
			"userId":     r.Header.Get("X-User-Id"),
			"firstName":  r.Header.Get("X-First-Name"),
			"email":      r.Header.Get("X-Email"),
			"permission": "editor",
			"roomId":     desktopId,
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	const numRooms = 50
	const usersPerRoom = 5
	totalSessions := numRooms * usersPerRoom

	var received atomic.Int64
	senders := make([]*websocket.Conn, numRooms)

	for r := 0; r < numRooms; r++ {
		roomId := fmt.Sprintf("room-%04d", r)
		for u := 0; u < usersPerRoom; u++ {
			wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/desktop/" + roomId
			header := http.Header{}
			header.Set("X-User-Id", fmt.Sprintf("u%d-%d", r, u))
			header.Set("X-First-Name", fmt.Sprintf("U%d_%d", r, u))
			header.Set("X-Email", fmt.Sprintf("u%d_%d@test.com", r, u))
			conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
			if err != nil {
				b.Fatalf("dial error room %d user %d: %v", r, u, err)
			}
			if u == 0 {
				senders[r] = conn
			}
			go func(c *websocket.Conn) {
				for {
					_, _, err := c.ReadMessage()
					if err != nil {
						return
					}
					received.Add(1)
				}
			}(conn)
		}
	}
	time.Sleep(200 * time.Millisecond)
	_ = totalSessions

	msg, _ := json.Marshal(map[string]any{"type": "asset_dragging", "payload": map[string]any{"x": 1}})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		room := i % numRooms
		senders[room].WriteMessage(websocket.TextMessage, msg)
	}

	expectedPerMsg := int64(usersPerRoom - 1)
	expected := int64(b.N) * expectedPerMsg
	deadline := time.After(15 * time.Second)
	for received.Load() < expected {
		select {
		case <-deadline:
			b.Logf("timeout: received %d/%d", received.Load(), expected)
			goto done2
		case <-time.After(time.Millisecond):
		}
	}
done2:
	b.StopTimer()
	b.Logf("total sessions: %d across %d rooms", totalSessions, numRooms)
	b.ReportMetric(float64(received.Load())/float64(b.N), "deliveries/op")
}

func BenchmarkGetSessionsInRoom(b *testing.B) {
	m := melody.New()
	m.Config.MaxMessageSize = 4096
	rooms := NewRoomManager(m)

	m.HandleConnect(func(s *melody.Session) {})
	m.HandleMessage(func(s *melody.Session, msg []byte) {})
	m.HandleDisconnect(func(s *melody.Session) {})

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/desktop/{desktopId}", func(w http.ResponseWriter, r *http.Request) {
		desktopId := r.PathValue("desktopId")
		m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId":  generateSessionId(),
			"userId":     r.Header.Get("X-User-Id"),
			"firstName":  "User",
			"email":      "u@test.com",
			"permission": "editor",
			"roomId":     desktopId,
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	const numRooms = 50
	const usersPerRoom = 10

	for r := 0; r < numRooms; r++ {
		for u := 0; u < usersPerRoom; u++ {
			wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/desktop/" + fmt.Sprintf("room-%d", r)
			header := http.Header{}
			header.Set("X-User-Id", fmt.Sprintf("u%d-%d", r, u))
			conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
			if err != nil {
				b.Fatal(err)
			}
			go func() {
				for {
					_, _, err := conn.ReadMessage()
					if err != nil {
						return
					}
				}
			}()
		}
	}
	time.Sleep(200 * time.Millisecond)

	b.Logf("total sessions: %d across %d rooms", numRooms*usersPerRoom, numRooms)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rooms.getSessionsInRoom("room-0000", "")
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
		messagesPerLevel  = 300
		pressureInterval  = 2 * time.Millisecond // each pressure sender fires every 2ms
		measureInterval   = 10 * time.Millisecond
	)

	t.Logf("GOMAXPROCS=%d  NumCPU=%d", runtime.GOMAXPROCS(0), runtime.NumCPU())

	for _, level := range levels {
		t.Run(level.label, func(t *testing.T) {
			m := melody.New()
			m.Config.MaxMessageSize = 4096
			rooms := NewRoomManager(m)

			m.HandleConnect(func(s *melody.Session) { rooms.HandleConnect(s) })
			m.HandleMessage(func(s *melody.Session, msg []byte) { rooms.HandleMessage(s, msg) })
			m.HandleDisconnect(func(s *melody.Session) { rooms.HandleDisconnect(s) })

			mux := http.NewServeMux()
			mux.HandleFunc("/ws/desktop/{desktopId}", func(w http.ResponseWriter, r *http.Request) {
				desktopId := r.PathValue("desktopId")
				m.HandleRequestWithKeys(w, r, map[string]any{
					"sessionId":  generateSessionId(),
					"userId":     r.Header.Get("X-User-Id"),
					"firstName":  r.Header.Get("X-First-Name"),
					"email":      r.Header.Get("X-Email"),
					"permission": "editor",
					"roomId":     desktopId,
				})
			})
			server := httptest.NewServer(mux)
			defer server.Close()

			type roomClients struct {
				sender    *websocket.Conn
				receivers []*websocket.Conn
			}

			// measuredReceiver continuously reads from a websocket and
			// exposes received messages via a channel, avoiding the
			// ReadDeadline issues that break gorilla/websocket state.
			type measuredReceiver struct {
				conn *websocket.Conn
				ch   chan json.RawMessage
				done chan struct{}
			}

			newMeasuredReceiver := func(c *websocket.Conn) *measuredReceiver {
				mr := &measuredReceiver{
					conn: c,
					ch:   make(chan json.RawMessage, 512),
					done: make(chan struct{}),
				}
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

			allRooms := make([]roomClients, level.numRooms)
			var allConns []*websocket.Conn

			// Target room (room 0) receivers get background reader goroutines
			var targetReceivers []*measuredReceiver

			for r := 0; r < level.numRooms; r++ {
				roomId := fmt.Sprintf("room-%04d", r)
				rc := roomClients{}
				for u := 0; u < level.usersPerRoom; u++ {
					wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/desktop/" + roomId
					header := http.Header{}
					header.Set("X-User-Id", fmt.Sprintf("u%d-%d", r, u))
					header.Set("X-First-Name", fmt.Sprintf("U%d_%d", r, u))
					header.Set("X-Email", fmt.Sprintf("u%d_%d@test.com", r, u))
					conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
					if err != nil {
						t.Fatalf("dial error room %d user %d: %v", r, u, err)
					}
					allConns = append(allConns, conn)
					if u == 0 {
						rc.sender = conn
					} else {
						rc.receivers = append(rc.receivers, conn)
						if r == 0 {
							targetReceivers = append(targetReceivers, newMeasuredReceiver(conn))
						}
					}
				}
				allRooms[r] = rc
			}

			// Wait for join/session messages to arrive, then drain them
			time.Sleep(500 * time.Millisecond)
			for _, mr := range targetReceivers {
				for {
					select {
					case <-mr.ch:
					default:
						goto drained
					}
				}
			drained:
			}
			// Drain non-target receivers via deadline (these won't be read again)
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

			// --- Continuous pressure: every pressure room sender blasts messages ---
			stopPressure := make(chan struct{})
			var pressureSent atomic.Int64
			var pressureWg sync.WaitGroup

			pressureMsg, _ := json.Marshal(map[string]any{
				"type": "asset_dragging", "payload": map[string]any{"x": 1, "y": 2},
			})

			for r := 1; r < level.numRooms; r++ {
				pressureWg.Add(1)
				go func(sender *websocket.Conn) {
					defer pressureWg.Done()
					defer func() { recover() }()
					for {
						select {
						case <-stopPressure:
							return
						default:
						}
						if err := sender.WriteMessage(websocket.TextMessage, pressureMsg); err != nil {
							return
						}
						pressureSent.Add(1)
						time.Sleep(pressureInterval)
					}
				}(allRooms[r].sender)
			}

			// --- Continuous drain: background goroutines consume pressure receivers ---
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

			// Let pressure build up for a moment
			time.Sleep(200 * time.Millisecond)

			// --- Measure target room latency under sustained pressure ---
			numReceivers := len(targetReceivers)
			latencies := make([]time.Duration, 0, messagesPerLevel)
			var delivered atomic.Int64
			var failed atomic.Int64
			expectedTotal := int64(messagesPerLevel) * int64(numReceivers)

			for i := 0; i < messagesPerLevel; i++ {
				msg, _ := json.Marshal(map[string]any{
					"type": "asset_moved", "payload": map[string]any{"seq": i},
				})

				start := time.Now()
				allRooms[0].sender.WriteMessage(websocket.TextMessage, msg)

				var recvWg sync.WaitGroup
				for _, mr := range targetReceivers {
					recvWg.Add(1)
					go func(mr *measuredReceiver) {
						defer recvWg.Done()
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
				recvWg.Wait()
				elapsed := time.Since(start)
				latencies = append(latencies, elapsed)

				time.Sleep(measureInterval)
			}

			// Stop pressure and wait for goroutines
			close(stopPressure)
			pressureWg.Wait()

			// Close all connections
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
			t.Logf("  expected:       %d deliveries", expectedTotal)
			t.Logf("  delivered:      %d", delivered.Load())
			t.Logf("  failed:         %d", failed.Load())
			t.Logf("  success rate:   %.2f%%", successRate)
			t.Logf("  pressure msgs:  %d (~%.0f msg/s across %d senders)", pressureSent.Load(), pressureRate, level.numRooms-1)
			t.Logf("  p50 latency:    %v", percentile(latencies, 0.50))
			t.Logf("  p95 latency:    %v", percentile(latencies, 0.95))
			t.Logf("  p99 latency:    %v", percentile(latencies, 0.99))
			t.Logf("  max latency:    %v", percentile(latencies, 1.0))
		})
	}
}
