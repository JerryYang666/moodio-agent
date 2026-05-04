package main

import (
	"encoding/json"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

// TestFederation_CrossWiredPayloadDropped — if a federated payload's topic
// field does not match the NATS subject it arrived on, the relay must drop
// it (defense in depth). We simulate this by directly calling
// handleFederatedMessage with a mismatched payload.
func TestFederation_CrossWiredPayloadDropped(t *testing.T) {
	fed, _ := newMockFederatorPair("us-east-2", "ap-northeast-1")
	_, rooms, server := setupTestServer()
	defer server.Close()
	rooms.federator = fed
	rooms.regionId = "us-east-2"

	victim := connectAndSubscribe(t, server, "desktop:real", "u1", "Alice", "editor")
	defer victim.close()
	time.Sleep(100 * time.Millisecond)
	victim.clearMessages()

	// Construct a TopicEvent whose payload claims desktop:other but which
	// arrives on subject "desktop:real". The relay must drop it without
	// delivering.
	bad := TopicEvent{
		Op:    OpEvent,
		Topic: "desktop:other",
		Type:  "asset_moved",
	}
	data, _ := json.Marshal(bad)
	rooms.handleFederatedMessage("desktop:real", "ap-northeast-1", data)

	time.Sleep(100 * time.Millisecond)
	if len(victim.findEventsOfType("asset_moved", "")) != 0 {
		t.Fatal("cross-wired payload must be dropped, not delivered")
	}
}

// TestFederation_PublishErrorDoesNotWedge — if the federator's Publish
// returns an error, the relay must still deliver locally and not block.
func TestFederation_PublishErrorDoesNotWedge(t *testing.T) {
	fed := &errorFederator{}
	_, rooms, server := setupTestServer()
	defer server.Close()
	rooms.federator = fed

	alice := connectAndSubscribe(t, server, "desktop:pub-err", "u1", "Alice", "editor")
	defer alice.close()
	bob := connectAndSubscribe(t, server, "desktop:pub-err", "u2", "Bob", "editor")
	defer bob.close()
	time.Sleep(100 * time.Millisecond)
	bob.clearMessages()

	alice.publish(t, "desktop:pub-err", "asset_moved", map[string]any{"x": 1})
	time.Sleep(200 * time.Millisecond)

	// Local delivery must still work.
	if len(bob.findEventsOfType("asset_moved", "desktop:pub-err")) == 0 {
		t.Fatal("local delivery must succeed even if federation Publish errored")
	}
	if fed.publishCalls.Load() == 0 {
		t.Fatal("expected federation Publish to be called")
	}
}

// TestFederation_ProductionTableTopicWorks — belt-and-suspenders test that
// the federation path handles the production-table namespace identically to
// desktop (namespace-agnostic string routing).
func TestFederation_ProductionTableTopicWorks(t *testing.T) {
	fedUS, fedHK := newMockFederatorPair("us-east-2", "ap-northeast-1")

	_, roomsUS, serverUS := setupTestServer()
	defer serverUS.Close()
	roomsUS.federator = fedUS
	roomsUS.regionId = "us-east-2"

	_, roomsHK, serverHK := setupTestServer()
	defer serverHK.Close()
	roomsHK.federator = fedHK
	roomsHK.regionId = "ap-northeast-1"

	topic := "production-table:pt-fed"

	alice := connectAndSubscribe(t, serverUS, topic, "u-alice", "Alice", "editor")
	defer alice.close()
	bob := connectAndSubscribe(t, serverHK, topic, "u-bob", "Bob", "editor")
	defer bob.close()
	time.Sleep(200 * time.Millisecond)
	bob.clearMessages()

	alice.publish(t, topic, "pt_cell_updated", map[string]any{"row": "r1", "col": "c1", "text": "hi"})
	time.Sleep(300 * time.Millisecond)

	if len(bob.findEventsOfType("pt_cell_updated", topic)) == 0 {
		t.Fatal("production-table event must federate cross-region")
	}
}

// TestEncodeDecodeFederatedMsg round-trips the wire envelope.
func TestEncodeDecodeFederatedMsg(t *testing.T) {
	payload := []byte(`{"op":"event","topic":"x:y"}`)
	wrapped, err := encodeFederatedMsg("us-east-2", payload)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	decoded, err := decodeFederatedMsg(wrapped)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if decoded.RegionID != "us-east-2" {
		t.Errorf("region mismatch: %q", decoded.RegionID)
	}
	if string(decoded.Payload) != string(payload) {
		t.Errorf("payload mismatch: %q", string(decoded.Payload))
	}
}

// ------------------------------------------------------------
// errorFederator: a test double whose Publish always errors.
// ------------------------------------------------------------

type errorFederator struct {
	publishCalls atomic.Int64
}

func (f *errorFederator) Publish(topic string, msg []byte) error {
	f.publishCalls.Add(1)
	return errors.New("test: publish unavailable")
}
func (f *errorFederator) Subscribe(topic string, handler func(string, []byte)) error {
	return nil
}
func (f *errorFederator) Unsubscribe(topic string) error { return nil }
func (f *errorFederator) Close()                         {}
