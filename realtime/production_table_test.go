package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/olahol/melody"
)

// setupPTTestServer creates a test server with both desktop and production-table
// routes, mirroring the real main.go setup with namespaced room IDs.
func setupPTTestServer() (*melody.Melody, *RoomManager, *httptest.Server) {
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
			"permission": headerOrDefault(r, "X-Permission", "editor"),
			"roomId":     "desktop:" + desktopId,
		})
	})

	mux.HandleFunc("/ws/production-table/{tableId}", func(w http.ResponseWriter, r *http.Request) {
		tableId := r.PathValue("tableId")
		m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId":  generateSessionId(),
			"userId":     r.Header.Get("X-User-Id"),
			"firstName":  r.Header.Get("X-First-Name"),
			"email":      r.Header.Get("X-Email"),
			"permission": headerOrDefault(r, "X-Permission", "editor"),
			"roomId":     "production-table:" + tableId,
		})
	})

	server := httptest.NewServer(mux)
	return m, rooms, server
}

func headerOrDefault(r *http.Request, key, fallback string) string {
	if v := r.Header.Get(key); v != "" {
		return v
	}
	return fallback
}

func connectPTClient(t *testing.T, server *httptest.Server, tableId, userId, firstName, permission string) *testClient {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/production-table/" + tableId
	header := http.Header{}
	header.Set("X-User-Id", userId)
	header.Set("X-First-Name", firstName)
	header.Set("X-Email", firstName+"@test.com")
	if permission != "" {
		header.Set("X-Permission", permission)
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("failed to connect PT client %s to table %s: %v", firstName, tableId, err)
	}

	tc := &testClient{conn: conn, done: make(chan struct{})}
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

func connectDesktopClientPT(t *testing.T, server *httptest.Server, desktopId, userId, firstName, permission string) *testClient {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/desktop/" + desktopId
	header := http.Header{}
	header.Set("X-User-Id", userId)
	header.Set("X-First-Name", firstName)
	header.Set("X-Email", firstName+"@test.com")
	if permission != "" {
		header.Set("X-Permission", permission)
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("failed to connect desktop client %s to desktop %s: %v", firstName, desktopId, err)
	}

	tc := &testClient{conn: conn, done: make(chan struct{})}
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

// TestPTRoomIsolation_CrossType verifies that a production-table room and a
// desktop room with the same raw ID are completely isolated from each other
// thanks to the room ID prefix ("desktop:" vs "production-table:").
func TestPTRoomIsolation_CrossType(t *testing.T) {
	_, _, server := setupPTTestServer()
	defer server.Close()

	sharedID := "same-uuid-1234"

	ptClient := connectPTClient(t, server, sharedID, "user1", "Alice", "editor")
	defer ptClient.close()

	desktopClient := connectDesktopClientPT(t, server, sharedID, "user2", "Bob", "editor")
	defer desktopClient.close()

	time.Sleep(50 * time.Millisecond)
	ptClient.clearMessages()
	desktopClient.clearMessages()

	// Send a PT event from Alice
	ptClient.send(t, map[string]any{
		"type":    "pt_cell_updated",
		"payload": map[string]any{"columnId": "col-1", "rowId": "row-1"},
	})

	// Send a desktop event from Bob
	desktopClient.send(t, map[string]any{
		"type":    "asset_moved",
		"payload": map[string]any{"assetId": "a-1", "x": 50},
	})

	time.Sleep(300 * time.Millisecond)

	ptClient.mu.Lock()
	ptMsgs := len(ptClient.messages)
	ptClient.mu.Unlock()

	desktopClient.mu.Lock()
	deskMsgs := len(desktopClient.messages)
	desktopClient.mu.Unlock()

	if ptMsgs != 0 {
		t.Errorf("PT client should receive 0 messages (only user in PT room), got %d", ptMsgs)
	}
	if deskMsgs != 0 {
		t.Errorf("Desktop client should receive 0 messages (only user in desktop room), got %d", deskMsgs)
	}
}

// TestPTRoomBroadcast verifies that events sent in a production-table room
// are delivered to other participants in the same room.
func TestPTRoomBroadcast(t *testing.T) {
	_, _, server := setupPTTestServer()
	defer server.Close()

	sender := connectPTClient(t, server, "table-abc", "user1", "Alice", "editor")
	defer sender.close()
	time.Sleep(50 * time.Millisecond)

	receiver := connectPTClient(t, server, "table-abc", "user2", "Bob", "editor")
	defer receiver.close()
	time.Sleep(50 * time.Millisecond)
	receiver.clearMessages()

	sender.send(t, map[string]any{
		"type":    "pt_cell_updated",
		"payload": map[string]any{"columnId": "c1", "rowId": "r1", "text": "hello"},
	})

	msgs := receiver.waitForMessages(1, 500*time.Millisecond)
	if len(msgs) == 0 {
		t.Fatal("receiver in the same PT room should have received the event")
	}
	if parseEventType(msgs[0]) != "pt_cell_updated" {
		t.Fatalf("expected pt_cell_updated, got %s", parseEventType(msgs[0]))
	}

	var out OutgoingEvent
	json.Unmarshal(msgs[0], &out)
	if out.UserID != "user1" {
		t.Errorf("stamped userId should be user1, got %s", out.UserID)
	}
	if out.FirstName != "Alice" {
		t.Errorf("stamped firstName should be Alice, got %s", out.FirstName)
	}
}

// TestPTViewerCannotMutate verifies that all production-table mutation events
// are blocked when sent by a viewer.
func TestPTViewerCannotMutate(t *testing.T) {
	_, _, server := setupPTTestServer()
	defer server.Close()

	viewer := connectPTClient(t, server, "table-perm", "user1", "Viewer", "viewer")
	defer viewer.close()
	time.Sleep(50 * time.Millisecond)

	editor := connectPTClient(t, server, "table-perm", "user2", "Editor", "editor")
	defer editor.close()
	time.Sleep(50 * time.Millisecond)
	editor.clearMessages()

	ptMutations := []string{
		"pt_cell_selected", "pt_cell_deselected", "pt_cell_updated",
		"pt_column_added", "pt_column_removed", "pt_column_renamed", "pt_columns_reordered",
		"pt_row_added", "pt_row_removed", "pt_rows_reordered",
		"pt_group_mutated",
	}
	for _, evt := range ptMutations {
		viewer.send(t, map[string]any{"type": evt, "payload": map[string]any{"id": "x"}})
	}

	time.Sleep(300 * time.Millisecond)

	editor.mu.Lock()
	editorMsgs := len(editor.messages)
	editor.mu.Unlock()
	if editorMsgs > 0 {
		t.Fatalf("all %d PT mutation types should be blocked for viewers, but editor received %d messages", len(ptMutations), editorMsgs)
	}
}

// TestPTEditorCanMutate verifies that editors in a production-table room can
// send mutation events and they are delivered to other participants.
func TestPTEditorCanMutate(t *testing.T) {
	_, _, server := setupPTTestServer()
	defer server.Close()

	editor := connectPTClient(t, server, "table-editor", "user1", "Alice", "editor")
	defer editor.close()
	time.Sleep(50 * time.Millisecond)

	receiver := connectPTClient(t, server, "table-editor", "user2", "Bob", "editor")
	defer receiver.close()
	time.Sleep(50 * time.Millisecond)
	receiver.clearMessages()

	ptMutations := []string{
		"pt_cell_selected", "pt_cell_deselected", "pt_cell_updated",
		"pt_column_added", "pt_column_removed", "pt_column_renamed", "pt_columns_reordered",
		"pt_row_added", "pt_row_removed", "pt_rows_reordered",
		"pt_group_mutated",
	}
	for _, evt := range ptMutations {
		editor.send(t, map[string]any{"type": evt, "payload": map[string]any{"id": "x"}})
	}

	msgs := receiver.waitForMessages(len(ptMutations), 1*time.Second)
	if len(msgs) != len(ptMutations) {
		t.Fatalf("editor should deliver all %d PT mutations, receiver got %d", len(ptMutations), len(msgs))
	}

	for i, evt := range ptMutations {
		if got := parseEventType(msgs[i]); got != evt {
			t.Errorf("message %d: expected %s, got %s", i, evt, got)
		}
	}
}

// TestPTJoinAndDisconnect verifies that room_joined, session_joined, and
// session_left events work correctly in production-table rooms.
func TestPTJoinAndDisconnect(t *testing.T) {
	_, _, server := setupPTTestServer()
	defer server.Close()

	c1 := connectPTClient(t, server, "table-join", "user1", "Alice", "editor")
	defer c1.close()

	msgs := c1.waitForMessages(1, 500*time.Millisecond)
	if len(msgs) < 1 || parseEventType(msgs[0]) != "room_joined" {
		t.Fatal("first PT client should receive room_joined")
	}

	var joinEvt RoomJoinedEvent
	json.Unmarshal(msgs[0], &joinEvt)
	if len(joinEvt.Sessions) != 0 {
		t.Fatalf("first user should see 0 existing sessions, got %d", len(joinEvt.Sessions))
	}

	c2 := connectPTClient(t, server, "table-join", "user2", "Bob", "editor")

	// c2 should see Alice in its room_joined
	msgs2 := c2.waitForMessages(1, 500*time.Millisecond)
	if len(msgs2) < 1 {
		t.Fatal("c2 should receive room_joined")
	}
	var joinEvt2 RoomJoinedEvent
	json.Unmarshal(msgs2[0], &joinEvt2)
	if len(joinEvt2.Sessions) != 1 || joinEvt2.Sessions[0].FirstName != "Alice" {
		t.Fatalf("second user should see Alice, got %+v", joinEvt2.Sessions)
	}

	// c1 should get session_joined for Bob
	allC1 := c1.waitForMessages(2, 500*time.Millisecond)
	found := false
	for _, m := range allC1 {
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

	// Disconnect c2 and verify c1 gets session_left
	c1.clearMessages()
	c2.close()
	time.Sleep(200 * time.Millisecond)

	leftMsgs := c1.waitForMessages(1, 500*time.Millisecond)
	foundLeft := false
	for _, m := range leftMsgs {
		if parseEventType(m) == "session_left" {
			foundLeft = true
		}
	}
	if !foundLeft {
		t.Fatal("c1 should have received session_left when c2 disconnected")
	}
}

// TestPTMultiRoomIsolation verifies that multiple production-table rooms are
// isolated from each other.
func TestPTMultiRoomIsolation(t *testing.T) {
	_, _, server := setupPTTestServer()
	defer server.Close()

	const numRooms = 5
	type pair struct {
		sender   *testClient
		receiver *testClient
	}
	pairs := make([]pair, numRooms)

	for i := 0; i < numRooms; i++ {
		tableId := "table-" + string(rune('A'+i))
		s := connectPTClient(t, server, tableId, "sender-"+tableId, "S"+tableId, "editor")
		time.Sleep(20 * time.Millisecond)
		r := connectPTClient(t, server, tableId, "recver-"+tableId, "R"+tableId, "editor")
		time.Sleep(20 * time.Millisecond)
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
		p.sender.send(t, map[string]any{
			"type":    "pt_cell_updated",
			"payload": map[string]any{"table": i},
		})
	}

	time.Sleep(500 * time.Millisecond)

	for i, p := range pairs {
		msgs := p.receiver.waitForMessages(1, 200*time.Millisecond)
		if len(msgs) != 1 {
			t.Errorf("table %d receiver expected 1 message, got %d", i, len(msgs))
			continue
		}
		var out OutgoingEvent
		json.Unmarshal(msgs[0], &out)
		payload, _ := json.Marshal(out.Payload)
		if !strings.Contains(string(payload), `"table"`) {
			t.Errorf("table %d received unexpected payload: %s", i, string(payload))
		}
	}
}
