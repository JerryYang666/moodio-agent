package main

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

// TestPTRoomIsolation_CrossType verifies that a production-table topic and a
// desktop topic with the same id are isolated thanks to the namespace prefix.
func TestPTRoomIsolation_CrossType(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	sharedID := "same-uuid-1234"

	pt := connectAndSubscribe(t, server, "production-table:"+sharedID, "u1", "Alice", "editor")
	defer pt.close()
	desk := connectAndSubscribe(t, server, "desktop:"+sharedID, "u2", "Bob", "editor")
	defer desk.close()
	time.Sleep(100 * time.Millisecond)
	pt.clearMessages()
	desk.clearMessages()

	pt.publish(t, "production-table:"+sharedID, "pt_cell_updated", map[string]any{"col": "c1", "row": "r1"})
	desk.publish(t, "desktop:"+sharedID, "asset_moved", map[string]any{"assetId": "a1"})

	time.Sleep(200 * time.Millisecond)

	if len(pt.findEventsOfType("asset_moved", "")) != 0 {
		t.Error("PT client should not see desktop events")
	}
	if len(desk.findEventsOfType("pt_cell_updated", "")) != 0 {
		t.Error("desktop client should not see PT events")
	}
}

func TestPTRoomBroadcast(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	topic := "production-table:table-abc"
	sender := connectAndSubscribe(t, server, topic, "u1", "Alice", "editor")
	defer sender.close()
	receiver := connectAndSubscribe(t, server, topic, "u2", "Bob", "editor")
	defer receiver.close()
	time.Sleep(50 * time.Millisecond)
	receiver.clearMessages()

	sender.publish(t, topic, "pt_cell_updated", map[string]any{"col": "c1", "row": "r1", "text": "hello"})
	time.Sleep(200 * time.Millisecond)

	events := receiver.findEventsOfType("pt_cell_updated", topic)
	if len(events) == 0 {
		t.Fatal("receiver should see pt_cell_updated")
	}
	var evt TopicEvent
	_ = json.Unmarshal(events[0], &evt)
	if evt.UserID != "u1" || evt.FirstName != "Alice" {
		t.Errorf("expected stamped identity Alice/u1, got %s/%s", evt.FirstName, evt.UserID)
	}
}

func TestPTViewerCannotMutate(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	topic := "production-table:perm"
	viewer := connectAndSubscribe(t, server, topic, "u1", "Viewer", "viewer")
	defer viewer.close()
	editor := connectAndSubscribe(t, server, topic, "u2", "Editor", "editor")
	defer editor.close()
	time.Sleep(50 * time.Millisecond)
	editor.clearMessages()

	ptMutations := []string{
		"pt_cell_selected", "pt_cell_deselected", "pt_cell_updated",
		"pt_column_added", "pt_column_removed", "pt_column_renamed", "pt_columns_reordered",
		"pt_row_added", "pt_row_removed", "pt_rows_reordered",
	}
	for _, evt := range ptMutations {
		viewer.publish(t, topic, evt, map[string]any{"id": "x"})
	}
	time.Sleep(300 * time.Millisecond)

	for _, evt := range ptMutations {
		if len(editor.findEventsOfType(evt, "")) != 0 {
			t.Errorf("viewer mutation %s should be blocked", evt)
		}
	}
}

func TestPTEditorCanMutate(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	topic := "production-table:editor"
	editor := connectAndSubscribe(t, server, topic, "u1", "Alice", "editor")
	defer editor.close()
	recv := connectAndSubscribe(t, server, topic, "u2", "Bob", "editor")
	defer recv.close()
	time.Sleep(50 * time.Millisecond)
	recv.clearMessages()

	ptMutations := []string{
		"pt_cell_selected", "pt_cell_deselected", "pt_cell_updated",
		"pt_column_added", "pt_column_removed", "pt_column_renamed", "pt_columns_reordered",
		"pt_row_added", "pt_row_removed", "pt_rows_reordered",
	}
	for _, evt := range ptMutations {
		editor.publish(t, topic, evt, map[string]any{"id": "x"})
	}
	time.Sleep(500 * time.Millisecond)

	for _, evt := range ptMutations {
		if len(recv.findEventsOfType(evt, "")) == 0 {
			t.Errorf("editor mutation %s should be delivered", evt)
		}
	}
}

func TestPTJoinAndDisconnect(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	topic := "production-table:join"

	c1 := dialRaw(t, server, "u1", "Alice", "editor")
	defer c1.close()
	c1.subscribe(t, topic)

	// c1 ack should list zero existing sessions.
	msgs := c1.waitForMessages(1, 500*time.Millisecond)
	var ack SubscribedAck
	for _, raw := range msgs {
		var env struct{ Op string }
		_ = json.Unmarshal(raw, &env)
		if env.Op == "subscribed" {
			_ = json.Unmarshal(raw, &ack)
		}
	}
	if len(ack.Sessions) != 0 {
		t.Fatalf("first user should see 0 existing, got %d", len(ack.Sessions))
	}

	c2 := dialRaw(t, server, "u2", "Bob", "editor")
	defer c2.close()
	c2.subscribe(t, topic)

	msgs2 := c2.waitForMessages(1, 500*time.Millisecond)
	var ack2 SubscribedAck
	for _, raw := range msgs2 {
		var env struct{ Op string }
		_ = json.Unmarshal(raw, &env)
		if env.Op == "subscribed" {
			_ = json.Unmarshal(raw, &ack2)
		}
	}
	if len(ack2.Sessions) != 1 || ack2.Sessions[0].FirstName != "Alice" {
		t.Fatalf("second user should see Alice, got %+v", ack2.Sessions)
	}

	time.Sleep(100 * time.Millisecond)
	if len(c1.findEventsOfType("session_joined", topic)) == 0 {
		t.Fatal("c1 should have received session_joined for Bob")
	}

	c1.clearMessages()
	c2.close()
	time.Sleep(200 * time.Millisecond)
	if len(c1.findEventsOfType("session_left", topic)) == 0 {
		t.Fatal("c1 should receive session_left when c2 disconnects")
	}
}

func TestPTMultiRoomIsolation(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	const numRooms = 5
	type pair struct{ sender, receiver *testClient }
	pairs := make([]pair, numRooms)

	for i := 0; i < numRooms; i++ {
		topic := fmt.Sprintf("production-table:table-%d", i)
		s := connectAndSubscribe(t, server, topic, fmt.Sprintf("s-%d", i), fmt.Sprintf("S%d", i), "editor")
		r := connectAndSubscribe(t, server, topic, fmt.Sprintf("r-%d", i), fmt.Sprintf("R%d", i), "editor")
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
		topic := fmt.Sprintf("production-table:table-%d", i)
		p.sender.publish(t, topic, "pt_cell_updated", map[string]any{"table": i})
	}
	time.Sleep(500 * time.Millisecond)

	for i, p := range pairs {
		events := p.receiver.findEventsOfType("pt_cell_updated", "")
		if len(events) != 1 {
			t.Errorf("table %d: expected 1 event, got %d", i, len(events))
		}
	}
}
