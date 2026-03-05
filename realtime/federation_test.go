package main

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

// mockFederator implements Federator for testing cross-region message
// forwarding without a real NATS server. Two mockFederators can be linked
// together to simulate two regions.
type mockFederator struct {
	regionId string
	mu       sync.Mutex
	subs     map[string]func(string, []byte)
	peer     *mockFederator
}

func newMockFederatorPair(regionA, regionB string) (*mockFederator, *mockFederator) {
	a := &mockFederator{regionId: regionA, subs: make(map[string]func(string, []byte))}
	b := &mockFederator{regionId: regionB, subs: make(map[string]func(string, []byte))}
	a.peer = b
	b.peer = a
	return a, b
}

func (f *mockFederator) Publish(roomId string, msg []byte) error {
	data, err := encodeFederatedMsg(f.regionId, msg)
	if err != nil {
		return err
	}
	// Deliver to the peer (other region) if it has a subscription.
	if f.peer != nil {
		f.peer.mu.Lock()
		handler, ok := f.peer.subs[roomId]
		f.peer.mu.Unlock()
		if ok {
			fm, err := decodeFederatedMsg(data)
			if err != nil {
				return err
			}
			if fm.RegionID != f.peer.regionId {
				go handler(fm.RegionID, fm.Payload)
			}
		}
	}
	return nil
}

func (f *mockFederator) Subscribe(roomId string, handler func(string, []byte)) error {
	f.mu.Lock()
	f.subs[roomId] = handler
	f.mu.Unlock()
	return nil
}

func (f *mockFederator) Unsubscribe(roomId string) error {
	f.mu.Lock()
	delete(f.subs, roomId)
	f.mu.Unlock()
	return nil
}

func (f *mockFederator) Close() {}

func TestFederationCrossRegionBroadcast(t *testing.T) {
	fedUS, fedHK := newMockFederatorPair("us-east-2", "ap-northeast-1")

	// Set up two servers simulating two regions
	_, roomsUS, serverUS := setupTestServer()
	defer serverUS.Close()
	roomsUS.federator = fedUS
	roomsUS.regionId = "us-east-2"

	_, roomsHK, serverHK := setupTestServer()
	defer serverHK.Close()
	roomsHK.federator = fedHK
	roomsHK.regionId = "ap-northeast-1"

	roomId := "room-federation-test"

	// Alice connects in the US
	alice := connectClient(t, serverUS, roomId, "user-alice", "Alice", "editor")
	defer alice.close()
	time.Sleep(50 * time.Millisecond)

	// Bob connects in Tokyo
	bob := connectClient(t, serverHK, roomId, "user-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(50 * time.Millisecond)

	// Clear initial join/session messages
	alice.clearMessages()
	bob.clearMessages()

	// Alice sends a message from the US region
	alice.send(t, map[string]any{
		"type":    "asset_moved",
		"payload": map[string]any{"id": "asset-1", "x": 42},
	})

	// Bob in HK should receive it via federation
	msgs := bob.waitForMessages(1, 2*time.Second)
	if len(msgs) == 0 {
		t.Fatal("Bob (HK) should receive the federated message from Alice (US)")
	}

	eventType := parseEventType(msgs[0])
	if eventType != "asset_moved" {
		t.Fatalf("expected asset_moved, got %s", eventType)
	}

	var out OutgoingEvent
	json.Unmarshal(msgs[0], &out)
	if out.FirstName != "Alice" {
		t.Errorf("message should be stamped with Alice's identity, got %s", out.FirstName)
	}
}

func TestFederationBidirectional(t *testing.T) {
	fedUS, fedHK := newMockFederatorPair("us-east-2", "ap-northeast-1")

	_, roomsUS, serverUS := setupTestServer()
	defer serverUS.Close()
	roomsUS.federator = fedUS
	roomsUS.regionId = "us-east-2"

	_, roomsHK, serverHK := setupTestServer()
	defer serverHK.Close()
	roomsHK.federator = fedHK
	roomsHK.regionId = "ap-northeast-1"

	roomId := "room-bidir-test"

	alice := connectClient(t, serverUS, roomId, "user-alice", "Alice", "editor")
	defer alice.close()
	time.Sleep(50 * time.Millisecond)

	bob := connectClient(t, serverHK, roomId, "user-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(50 * time.Millisecond)

	alice.clearMessages()
	bob.clearMessages()

	// Bob sends from HK
	bob.send(t, map[string]any{
		"type":    "asset_resized",
		"payload": map[string]any{"id": "asset-2", "w": 100},
	})

	// Alice in US should receive it
	msgs := alice.waitForMessages(1, 2*time.Second)
	if len(msgs) == 0 {
		t.Fatal("Alice (US) should receive the federated message from Bob (HK)")
	}
	if parseEventType(msgs[0]) != "asset_resized" {
		t.Fatalf("expected asset_resized, got %s", parseEventType(msgs[0]))
	}
}

func TestFederationPresenceEvents(t *testing.T) {
	fedUS, fedHK := newMockFederatorPair("us-east-2", "ap-northeast-1")

	_, roomsUS, serverUS := setupTestServer()
	defer serverUS.Close()
	roomsUS.federator = fedUS
	roomsUS.regionId = "us-east-2"

	_, roomsHK, serverHK := setupTestServer()
	defer serverHK.Close()
	roomsHK.federator = fedHK
	roomsHK.regionId = "ap-northeast-1"

	roomId := "room-presence-test"

	// Alice connects in the US
	alice := connectClient(t, serverUS, roomId, "user-alice", "Alice", "editor")
	defer alice.close()
	time.Sleep(50 * time.Millisecond)
	alice.clearMessages()

	// Bob connects in HK -- Alice should get session_joined via federation
	bob := connectClient(t, serverHK, roomId, "user-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(100 * time.Millisecond)

	msgs := alice.waitForMessages(1, 2*time.Second)
	found := false
	for _, m := range msgs {
		if parseEventType(m) == "session_joined" {
			var out OutgoingEvent
			json.Unmarshal(m, &out)
			if out.FirstName == "Bob" {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("Alice should receive session_joined for Bob via federation")
	}

	// Disconnect Bob -- Alice should get session_left via federation
	alice.clearMessages()
	bob.close()
	time.Sleep(200 * time.Millisecond)

	msgs = alice.waitForMessages(1, 2*time.Second)
	found = false
	for _, m := range msgs {
		if parseEventType(m) == "session_left" {
			var out OutgoingEvent
			json.Unmarshal(m, &out)
			if out.FirstName == "Bob" {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("Alice should receive session_left for Bob via federation")
	}
}

func TestFederationRoomIsolation(t *testing.T) {
	fedUS, fedHK := newMockFederatorPair("us-east-2", "ap-northeast-1")

	_, roomsUS, serverUS := setupTestServer()
	defer serverUS.Close()
	roomsUS.federator = fedUS
	roomsUS.regionId = "us-east-2"

	_, roomsHK, serverHK := setupTestServer()
	defer serverHK.Close()
	roomsHK.federator = fedHK
	roomsHK.regionId = "ap-northeast-1"

	// Alice in room-a on US, Bob in room-b on HK
	alice := connectClient(t, serverUS, "room-a-fed", "user-alice", "Alice", "editor")
	defer alice.close()
	time.Sleep(50 * time.Millisecond)

	bob := connectClient(t, serverHK, "room-b-fed", "user-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(50 * time.Millisecond)

	alice.clearMessages()
	bob.clearMessages()

	// Alice sends in room-a
	alice.send(t, map[string]any{
		"type":    "asset_moved",
		"payload": map[string]any{"id": "x"},
	})
	time.Sleep(300 * time.Millisecond)

	// Bob should NOT get it (different room)
	bob.mu.Lock()
	bobMsgs := len(bob.messages)
	bob.mu.Unlock()
	if bobMsgs > 0 {
		t.Fatalf("Bob in room-b should not receive messages from room-a, got %d", bobMsgs)
	}
}

func TestFederationSenderDoesNotEcho(t *testing.T) {
	fedUS, fedHK := newMockFederatorPair("us-east-2", "ap-northeast-1")

	_, roomsUS, serverUS := setupTestServer()
	defer serverUS.Close()
	roomsUS.federator = fedUS
	roomsUS.regionId = "us-east-2"

	_, roomsHK, serverHK := setupTestServer()
	defer serverHK.Close()
	roomsHK.federator = fedHK
	roomsHK.regionId = "ap-northeast-1"

	roomId := "room-no-echo-test"

	alice := connectClient(t, serverUS, roomId, "user-alice", "Alice", "editor")
	defer alice.close()
	time.Sleep(50 * time.Millisecond)

	bob := connectClient(t, serverHK, roomId, "user-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(50 * time.Millisecond)

	alice.clearMessages()

	alice.send(t, map[string]any{
		"type":    "asset_moved",
		"payload": map[string]any{"id": "x"},
	})
	time.Sleep(300 * time.Millisecond)

	// Alice should NOT receive her own message back (neither locally nor via federation)
	alice.mu.Lock()
	aliceMsgs := len(alice.messages)
	alice.mu.Unlock()
	if aliceMsgs > 0 {
		t.Fatalf("Alice should not receive her own message back, got %d", aliceMsgs)
	}
}
