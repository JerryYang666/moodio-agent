package main

import (
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

func newMockFederatorPair(a, b string) (*mockFederator, *mockFederator) {
	fa := &mockFederator{regionId: a, subs: make(map[string]func(string, []byte))}
	fb := &mockFederator{regionId: b, subs: make(map[string]func(string, []byte))}
	fa.peer = fb
	fb.peer = fa
	return fa, fb
}

func (f *mockFederator) Publish(topic string, msg []byte) error {
	data, err := encodeFederatedMsg(f.regionId, msg)
	if err != nil {
		return err
	}
	if f.peer != nil {
		f.peer.mu.Lock()
		handler, ok := f.peer.subs[topic]
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

func (f *mockFederator) Subscribe(topic string, handler func(string, []byte)) error {
	f.mu.Lock()
	f.subs[topic] = handler
	f.mu.Unlock()
	return nil
}

func (f *mockFederator) Unsubscribe(topic string) error {
	f.mu.Lock()
	delete(f.subs, topic)
	f.mu.Unlock()
	return nil
}

func (f *mockFederator) Close() {}

func TestFederationCrossRegionBroadcast(t *testing.T) {
	fedUS, fedHK := newMockFederatorPair("us-east-2", "ap-northeast-1")

	_, roomsUS, serverUS := setupTestServer()
	defer serverUS.Close()
	roomsUS.federator = fedUS
	roomsUS.regionId = "us-east-2"

	_, roomsHK, serverHK := setupTestServer()
	defer serverHK.Close()
	roomsHK.federator = fedHK
	roomsHK.regionId = "ap-northeast-1"

	topic := "desktop:fed-test"

	alice := connectAndSubscribe(t, serverUS, topic, "u-alice", "Alice", "editor")
	defer alice.close()
	time.Sleep(100 * time.Millisecond)

	bob := connectAndSubscribe(t, serverHK, topic, "u-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(100 * time.Millisecond)

	alice.clearMessages()
	bob.clearMessages()

	alice.publish(t, topic, "asset_moved", map[string]any{"id": "a1", "x": 42})

	time.Sleep(300 * time.Millisecond)
	events := bob.findEventsOfType("asset_moved", topic)
	if len(events) == 0 {
		t.Fatal("bob should receive federated asset_moved")
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

	topic := "desktop:bidir-test"

	alice := connectAndSubscribe(t, serverUS, topic, "u-alice", "Alice", "editor")
	defer alice.close()
	bob := connectAndSubscribe(t, serverHK, topic, "u-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(200 * time.Millisecond)

	alice.clearMessages()
	bob.clearMessages()

	bob.publish(t, topic, "asset_resized", map[string]any{"id": "a2", "w": 100})
	time.Sleep(300 * time.Millisecond)
	if len(alice.findEventsOfType("asset_resized", topic)) == 0 {
		t.Fatal("alice should receive federated asset_resized from bob")
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

	topic := "desktop:presence-test"

	alice := connectAndSubscribe(t, serverUS, topic, "u-alice", "Alice", "editor")
	defer alice.close()
	time.Sleep(100 * time.Millisecond)
	alice.clearMessages()

	bob := connectAndSubscribe(t, serverHK, topic, "u-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(300 * time.Millisecond)

	if len(alice.findEventsOfType("session_joined", topic)) == 0 {
		t.Fatal("alice should see session_joined for bob via federation")
	}

	alice.clearMessages()
	bob.close()
	time.Sleep(300 * time.Millisecond)
	if len(alice.findEventsOfType("session_left", topic)) == 0 {
		t.Fatal("alice should see session_left for bob via federation")
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

	alice := connectAndSubscribe(t, serverUS, "desktop:room-a", "u-alice", "Alice", "editor")
	defer alice.close()
	bob := connectAndSubscribe(t, serverHK, "desktop:room-b", "u-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(200 * time.Millisecond)
	alice.clearMessages()
	bob.clearMessages()

	alice.publish(t, "desktop:room-a", "asset_moved", map[string]any{"id": "x"})
	time.Sleep(300 * time.Millisecond)

	if len(bob.findEventsOfType("asset_moved", "")) != 0 {
		t.Fatal("bob in room-b should not see alice's message in room-a")
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

	topic := "desktop:noecho-test"

	alice := connectAndSubscribe(t, serverUS, topic, "u-alice", "Alice", "editor")
	defer alice.close()
	bob := connectAndSubscribe(t, serverHK, topic, "u-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(200 * time.Millisecond)
	alice.clearMessages()

	alice.publish(t, topic, "asset_moved", map[string]any{"id": "x"})
	time.Sleep(300 * time.Millisecond)

	if len(alice.findEventsOfType("asset_moved", "")) != 0 {
		t.Fatal("alice should not receive her own message back")
	}
}

func TestFederationPresenceSync(t *testing.T) {
	fedUS, fedHK := newMockFederatorPair("us-east-2", "ap-northeast-1")

	_, roomsUS, serverUS := setupTestServer()
	defer serverUS.Close()
	roomsUS.federator = fedUS
	roomsUS.regionId = "us-east-2"

	_, roomsHK, serverHK := setupTestServer()
	defer serverHK.Close()
	roomsHK.federator = fedHK
	roomsHK.regionId = "ap-northeast-1"

	topic := "desktop:sync-test"

	alice := connectAndSubscribe(t, serverUS, topic, "u-alice", "Alice", "editor")
	defer alice.close()
	time.Sleep(200 * time.Millisecond)

	bob := connectAndSubscribe(t, serverHK, topic, "u-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(400 * time.Millisecond)

	if len(bob.findEventsOfType("session_joined", topic)) == 0 {
		t.Fatal("bob (HK latecomer) should discover Alice via presence sync")
	}

	if len(alice.findEventsOfType("session_joined", topic)) == 0 {
		t.Fatal("alice (US) should know about bob via normal federation")
	}

	roomsHK.remoteMu.RLock()
	hkRemote := roomsHK.remoteSessions[topic]
	roomsHK.remoteMu.RUnlock()
	if len(hkRemote) == 0 {
		t.Fatal("HK remoteSessions should contain Alice")
	}
	found := false
	for _, s := range hkRemote {
		if s.FirstName == "Alice" {
			found = true
		}
	}
	if !found {
		t.Fatal("HK remoteSessions should contain Alice's session info")
	}
}
