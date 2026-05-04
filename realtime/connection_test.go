package main

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// ------------------------------------------------------------
// parseTopic — validation corners
// ------------------------------------------------------------

func TestParseTopic_Valid(t *testing.T) {
	cases := []struct {
		in, ns, id string
	}{
		{"desktop:abc", "desktop", "abc"},
		{"production-table:t-123_ABC", "production-table", "t-123_ABC"},
		{"desktop:" + string(make([]byte, 0, 128)) + "x", "desktop", "x"},
	}
	for _, c := range cases {
		ns, id, err := parseTopic(c.in)
		if err != nil {
			t.Errorf("parseTopic(%q) unexpected error: %v", c.in, err)
			continue
		}
		if ns != c.ns || id != c.id {
			t.Errorf("parseTopic(%q) = (%q,%q), want (%q,%q)", c.in, ns, id, c.ns, c.id)
		}
	}
}

func TestParseTopic_Invalid(t *testing.T) {
	cases := []string{
		"",
		"   ",
		"desktop",
		":abc",
		"desktop:",
		"nope:whatever",
		"desktop:has spaces",
		"desktop:bad!char",
		"desktop:" + longString(129),
	}
	for _, c := range cases {
		if _, _, err := parseTopic(c); err == nil {
			t.Errorf("parseTopic(%q) should fail", c)
		}
	}
}

func longString(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = 'a'
	}
	return string(b)
}

// ------------------------------------------------------------
// SessionSubs behavior
// ------------------------------------------------------------

func TestSessionSubs_AddRemoveLen(t *testing.T) {
	s := newSessionSubs()
	if s.Len() != 0 {
		t.Fatal("new subs should be empty")
	}
	if added := s.Add("desktop:A", "editor"); !added {
		t.Fatal("first add should report added=true")
	}
	if added := s.Add("desktop:A", "viewer"); added {
		t.Fatal("second add should report added=false (already present)")
	}
	e, ok := s.Get("desktop:A")
	if !ok || e.Permission != "viewer" {
		t.Fatalf("expected permission to be overwritten to viewer, got %+v", e)
	}
	if s.Len() != 1 {
		t.Fatalf("len = %d", s.Len())
	}
	if entry, ok := s.Remove("desktop:A"); !ok || entry.Permission != "viewer" {
		t.Fatalf("remove should return prior entry, got ok=%v %+v", ok, entry)
	}
	if _, ok := s.Remove("desktop:A"); ok {
		t.Fatal("second remove should return ok=false")
	}
}

func TestSessionSubs_TokenBucket(t *testing.T) {
	s := newSessionSubs()
	// 20 tokens at start.
	for i := 0; i < MaxSubscribeTokens; i++ {
		if !s.TryConsume() {
			t.Fatalf("token %d must be available", i)
		}
	}
	if s.TryConsume() {
		t.Fatal("21st token should be denied")
	}
	// Wait long enough to refill one token.
	time.Sleep(time.Duration(float64(time.Second) / SubscribeTokensPerSec))
	if !s.TryConsume() {
		t.Fatal("token should refill after wait")
	}
}

func TestSessionSubs_SnapshotStable(t *testing.T) {
	s := newSessionSubs()
	s.Add("a:1", "editor")
	s.Add("b:1", "editor")
	snap := s.Snapshot()
	if len(snap) != 2 {
		t.Fatalf("snapshot len=%d", len(snap))
	}
	// Mutation post-snapshot must not affect the returned slice.
	s.Remove("a:1")
	if len(snap) != 2 {
		t.Fatalf("snapshot should be independent, got len=%d", len(snap))
	}
}

// ------------------------------------------------------------
// authzCache behavior
// ------------------------------------------------------------

func TestAuthzCache_ExpiresAfterTTL(t *testing.T) {
	c := newAuthzCache()
	k := authzCacheKey{SessionID: "s1", Topic: "desktop:A"}
	c.Put(k, "editor")
	if v, ok := c.Get(k); !ok || v != "editor" {
		t.Fatal("fresh entry should hit")
	}
	// Rewrite the entry with a pre-expired timestamp.
	c.mu.Lock()
	c.entries[k] = authzCacheEntry{
		Permission: "editor",
		StoredAt:   time.Now().Add(-AuthzCacheTTL - time.Second),
	}
	c.mu.Unlock()
	if _, ok := c.Get(k); ok {
		t.Fatal("expired entry should miss")
	}
	// Expired entry should be pruned from the map.
	c.mu.Lock()
	_, still := c.entries[k]
	c.mu.Unlock()
	if still {
		t.Fatal("expired entry should be deleted on Get")
	}
}

func TestAuthzCache_InvalidateSession(t *testing.T) {
	c := newAuthzCache()
	c.Put(authzCacheKey{SessionID: "s1", Topic: "t1"}, "editor")
	c.Put(authzCacheKey{SessionID: "s1", Topic: "t2"}, "viewer")
	c.Put(authzCacheKey{SessionID: "s2", Topic: "t1"}, "editor")

	c.InvalidateSession("s1")

	if _, ok := c.Get(authzCacheKey{SessionID: "s1", Topic: "t1"}); ok {
		t.Error("s1/t1 should be gone")
	}
	if _, ok := c.Get(authzCacheKey{SessionID: "s1", Topic: "t2"}); ok {
		t.Error("s1/t2 should be gone")
	}
	if _, ok := c.Get(authzCacheKey{SessionID: "s2", Topic: "t1"}); !ok {
		t.Error("s2/t1 should still be there")
	}
}

// ------------------------------------------------------------
// Protocol edge cases via full server
// ------------------------------------------------------------

func TestUnknownOp_ReturnsBadRequest(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()

	c.sendRaw(t, map[string]any{"op": "blast", "ref": "r1"})
	time.Sleep(100 * time.Millisecond)

	c.mu.Lock()
	defer c.mu.Unlock()
	found := false
	for _, raw := range c.messages {
		var env struct{ Op, Code, Ref string }
		_ = json.Unmarshal(raw, &env)
		if env.Op == "error" && env.Code == ErrCodeBadRequest && env.Ref == "r1" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected bad_request error for unknown op")
	}
}

func TestInvalidJSON_ReturnsBadRequest(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()

	if err := c.conn.WriteMessage(websocket.TextMessage, []byte("{not json")); err != nil {
		t.Fatalf("write: %v", err)
	}
	time.Sleep(100 * time.Millisecond)

	c.mu.Lock()
	defer c.mu.Unlock()
	found := false
	for _, raw := range c.messages {
		var env struct{ Op, Code string }
		_ = json.Unmarshal(raw, &env)
		if env.Op == "error" && env.Code == ErrCodeBadRequest {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected bad_request error for invalid JSON")
	}
}

func TestMaxTopicsCap_ReturnsRateLimited(t *testing.T) {
	// Shrink the cap for this test by going right up to MaxTopicsPerSession.
	// We burn through the subscribe token bucket along the way, so this test
	// is sensitive to MaxTopicsPerSession > MaxSubscribeTokens. With defaults
	// (50 vs 20), we'd trip rate_limited before reaching the cap. So we
	// pre-pump the bucket by sleeping to refill it periodically.
	//
	// Simpler: verify the cap logic directly through SessionSubs + a
	// wire-level probe. We call Add 50 times, then send subscribe #51 and
	// expect rate_limited.
	_, rooms, server := setupTestServer()
	defer server.Close()
	_ = rooms

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()

	// Pre-populate subs via the real handler, but with a large enough bucket.
	// Temporarily raise the token bucket via internal fields isn't exposed; we
	// instead batch-subscribe to MaxTopicsPerSession unique topics with sleeps
	// just large enough to refill tokens.
	for i := 0; i < MaxTopicsPerSession; i++ {
		topic := fmt.Sprintf("desktop:cap-%02d", i)
		c.subscribe(t, topic)
		// No sleep needed — subscribe ack arrives serially from the same
		// dispatcher; the test ack-waiter keeps us at <=1 in-flight sub.
		// But we do need to refill tokens since MaxTopicsPerSession >
		// MaxSubscribeTokens. Sleep once per token consumed.
		if (i+1)%MaxSubscribeTokens == 0 {
			time.Sleep(time.Second * time.Duration(MaxSubscribeTokens) / time.Duration(SubscribeTokensPerSec))
		}
	}

	// #51 must fail — but the token bucket might also fire first. Accept
	// EITHER rate_limited (cap) here; the code path is the same.
	code := c.subscribeExpectError(t, "desktop:one-too-many")
	if code != ErrCodeRateLimited {
		t.Fatalf("expected rate_limited at cap, got %s", code)
	}
}

func TestIdempotentUnsubscribe_SecondReturnsNotSubscribed(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c := connectAndSubscribe(t, server, "desktop:unsub", "u1", "Alice", "editor")
	defer c.close()

	// First unsubscribe succeeds — track ack.
	c.sendRaw(t, map[string]any{"op": "unsubscribe", "topic": "desktop:unsub", "ref": "u1"})

	// Second unsubscribe returns not_subscribed.
	c.sendRaw(t, map[string]any{"op": "unsubscribe", "topic": "desktop:unsub", "ref": "u2"})
	time.Sleep(200 * time.Millisecond)

	c.mu.Lock()
	defer c.mu.Unlock()
	var sawErr bool
	for _, raw := range c.messages {
		var env struct{ Op, Code, Ref string }
		_ = json.Unmarshal(raw, &env)
		if env.Op == "error" && env.Ref == "u2" && env.Code == ErrCodeNotSubscribed {
			sawErr = true
		}
	}
	if !sawErr {
		t.Fatal("second unsubscribe should return not_subscribed")
	}
}

func TestPublishWithRef_NonSubscribed_ReturnsNotSubscribed(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()

	// Publish without subscribing first.
	c.sendRaw(t, map[string]any{
		"op":      "publish",
		"topic":   "desktop:none",
		"type":    "asset_moved",
		"payload": map[string]any{"id": "x"},
		"ref":     "p1",
	})
	time.Sleep(150 * time.Millisecond)

	c.mu.Lock()
	defer c.mu.Unlock()
	found := false
	for _, raw := range c.messages {
		var env struct{ Op, Code, Ref string }
		_ = json.Unmarshal(raw, &env)
		if env.Op == "error" && env.Ref == "p1" && env.Code == ErrCodeNotSubscribed {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("publish with ref to non-subscribed topic should return not_subscribed")
	}
}

func TestPublishWithoutRef_NonSubscribed_SilentlyDropped(t *testing.T) {
	_, _, server := setupTestServer()
	defer server.Close()

	c := dialRaw(t, server, "u1", "Alice", "editor")
	defer c.close()

	c.sendRaw(t, map[string]any{
		"op":      "publish",
		"topic":   "desktop:none",
		"type":    "asset_moved",
		"payload": map[string]any{"id": "x"},
	})
	time.Sleep(150 * time.Millisecond)

	c.mu.Lock()
	defer c.mu.Unlock()
	for _, raw := range c.messages {
		var env struct{ Op string }
		_ = json.Unmarshal(raw, &env)
		if env.Op == "error" {
			t.Fatalf("publish without ref should not error: %s", string(raw))
		}
	}
}

func TestDisconnectWhileSubscribeInFlight(t *testing.T) {
	// Regression guard: subscribing concurrently with close must not panic
	// or deadlock. The dispatcher drain path should cleanly handle a channel
	// close while it's parked waiting on authorize.
	_, rooms, server := setupTestServer()
	defer server.Close()

	// Slow down authorize so the dispatcher is guaranteed to be mid-call when
	// we close the connection.
	rooms.authorizeOverride = func(*Claims, string) (string, error) {
		time.Sleep(200 * time.Millisecond)
		return "editor", nil
	}

	c := dialRaw(t, server, "u1", "Alice", "editor")
	c.sendRaw(t, map[string]any{"op": "subscribe", "topic": "desktop:race", "ref": "r"})
	time.Sleep(50 * time.Millisecond) // dispatcher is now in the slow authorize
	c.close()

	// Give the server time to finish teardown without panicking.
	time.Sleep(400 * time.Millisecond)
}
