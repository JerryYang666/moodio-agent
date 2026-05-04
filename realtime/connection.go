package main

import (
	"sync"
	"time"

	"github.com/olahol/melody"
)

// Per-session limits.
const (
	MaxTopicsPerSession   = 50
	SubscribeTokensPerSec = 2.0 // 20 subscribes per 10 seconds, rolling
	MaxSubscribeTokens    = 20

	AuthzCacheTTL = 30 * time.Second

	// Bounded queue for ops awaiting dispatch on a session. Real-world bursts
	// (cursor moves, paint events) are publishes, not subscribes, and publishes
	// are synchronous (no blocking authorize call), so 64 is ample.
	sessionOpQueueSize = 64
)

// sessionKeysKey is the melody session.Get key under which we stash
// SessionKeys. The old "roomId", "permission", etc. keys are no longer used.
const sessionKeysKey = "__keys"

// SessionKeys is the per-session state cached at connect time.
// Access is read-only after HandleConnect returns (with the exception of
// SubsSubs mutations, which have their own mutex).
type SessionKeys struct {
	SessionID string
	Claims    *Claims
	Subs      *SessionSubs

	// Op channel and its done chan. Written once (at connect), read until
	// disconnect. HandleMessage pushes parsed ops here; a per-session goroutine
	// drains and dispatches. HandleDisconnect closes opCh.
	opCh   chan IncomingOp
	opDone chan struct{}
}

// DisplayName returns a human-readable label for logs.
func (k *SessionKeys) DisplayName() string {
	if k == nil || k.Claims == nil {
		return "unknown-user"
	}
	return displayName(k.Claims.FirstName, k.Claims.Email)
}

// subEntry is the per-topic record stored in SessionSubs.
type subEntry struct {
	Permission string
}

// SessionSubs holds the set of topics this session is subscribed to along
// with the permission granted on each, plus a token bucket for subscribe
// rate limiting.
type SessionSubs struct {
	mu     sync.RWMutex
	topics map[string]subEntry

	// token bucket: tokens refill at SubscribeTokensPerSec up to MaxSubscribeTokens.
	tokens     float64
	lastRefill time.Time
}

func newSessionSubs() *SessionSubs {
	return &SessionSubs{
		topics:     make(map[string]subEntry),
		tokens:     MaxSubscribeTokens,
		lastRefill: time.Now(),
	}
}

func (s *SessionSubs) Get(topic string) (subEntry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.topics[topic]
	return e, ok
}

// Add records a new subscription. Returns true if the entry was newly added,
// or false if the session was already subscribed (in which case permission
// is refreshed to the provided value). Also returns the total count so the
// caller can enforce the per-session cap before calling Add.
func (s *SessionSubs) Add(topic, permission string) (added bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, exists := s.topics[topic]
	s.topics[topic] = subEntry{Permission: permission}
	return !exists
}

// Remove drops a subscription and returns the old entry (if any).
func (s *SessionSubs) Remove(topic string) (subEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.topics[topic]
	if ok {
		delete(s.topics, topic)
	}
	return e, ok
}

// Len returns the current number of active subscriptions.
func (s *SessionSubs) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.topics)
}

// Snapshot returns a copy of the active topic list. Used by HandleDisconnect
// so cleanup can iterate without holding the mutex (and without recursing
// into removeFromTopic under the same lock).
func (s *SessionSubs) Snapshot() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]string, 0, len(s.topics))
	for t := range s.topics {
		out = append(out, t)
	}
	return out
}

// TryConsume spends one subscribe token. Returns false if the bucket is empty.
func (s *SessionSubs) TryConsume() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	elapsed := now.Sub(s.lastRefill).Seconds()
	if elapsed > 0 {
		s.tokens += elapsed * SubscribeTokensPerSec
		if s.tokens > MaxSubscribeTokens {
			s.tokens = MaxSubscribeTokens
		}
		s.lastRefill = now
	}
	if s.tokens < 1 {
		return false
	}
	s.tokens--
	return true
}

// authzCacheKey is keyed by (sessionId, topic). A per-session cache, not a
// global cache, so that revocation at the account level still invalidates
// when a user opens a new WS connection.
type authzCacheKey struct {
	SessionID string
	Topic     string
}

type authzCacheEntry struct {
	Permission string
	StoredAt   time.Time
}

// authzCache is the per-relay authorize-result cache. Hooked onto RoomManager.
type authzCache struct {
	mu      sync.Mutex
	entries map[authzCacheKey]authzCacheEntry
}

func newAuthzCache() *authzCache {
	return &authzCache{entries: make(map[authzCacheKey]authzCacheEntry)}
}

func (c *authzCache) Get(k authzCacheKey) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[k]
	if !ok {
		return "", false
	}
	if time.Since(e.StoredAt) > AuthzCacheTTL {
		delete(c.entries, k)
		return "", false
	}
	return e.Permission, true
}

func (c *authzCache) Put(k authzCacheKey, permission string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[k] = authzCacheEntry{Permission: permission, StoredAt: time.Now()}
}

func (c *authzCache) Invalidate(k authzCacheKey) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, k)
}

// InvalidateSession drops every cache entry for a given sessionId. Called on
// disconnect so the map does not grow unbounded with dead sessions.
func (c *authzCache) InvalidateSession(sessionId string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.entries {
		if k.SessionID == sessionId {
			delete(c.entries, k)
		}
	}
}

// cacheSessionKeys stashes a fresh SessionKeys onto the melody session. Called
// from HandleConnect. Starts the per-session dispatch goroutine.
func (rm *RoomManager) cacheSessionKeys(s *melody.Session, sessionId string, claims *Claims) *SessionKeys {
	keys := &SessionKeys{
		SessionID: sessionId,
		Claims:    claims,
		Subs:      newSessionSubs(),
		opCh:      make(chan IncomingOp, sessionOpQueueSize),
		opDone:    make(chan struct{}),
	}
	s.Set(sessionKeysKey, keys)
	go rm.runDispatcher(s, keys)
	return keys
}

func getSessionKeys(s *melody.Session) *SessionKeys {
	v, ok := s.Get(sessionKeysKey)
	if !ok {
		return nil
	}
	keys, ok := v.(*SessionKeys)
	if !ok {
		return nil
	}
	return keys
}

// runDispatcher serializes all control/publish ops for a single session.
// Blocking calls (authorize HTTP) run here, off the melody read pump.
func (rm *RoomManager) runDispatcher(s *melody.Session, keys *SessionKeys) {
	defer close(keys.opDone)
	for op := range keys.opCh {
		switch op.Op {
		case OpSubscribe:
			rm.handleSubscribe(s, keys, op)
		case OpUnsubscribe:
			rm.handleUnsubscribe(s, keys, op)
		case OpPublish:
			rm.handlePublish(s, keys, op)
		default:
			writeError(s, ErrorMsg{
				Op:      OpError,
				Code:    ErrCodeBadRequest,
				Message: "unknown op",
				Ref:     op.Ref,
			})
		}
	}
}
