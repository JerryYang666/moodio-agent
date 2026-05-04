package main

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/olahol/melody"
)

const (
	EventSessionJoined = "session_joined"
	EventSessionLeft   = "session_left"
	EventPresenceSync  = "presence_sync_request"
)

// RoomManager tracks topic -> local session membership, per-relay authorize
// caching, and federation wiring. Sessions can be subscribed to many topics;
// each topic has its own membership set.
type RoomManager struct {
	melody *melody.Melody

	mu     sync.RWMutex
	topics map[string]map[*melody.Session]struct{}

	authCache *authzCache

	// Config populated by main.go at startup.
	apiBase string
	auth    *Auth

	// authorizeOverride, when non-nil, replaces the HTTP authorize call.
	// Used by tests to avoid standing up a second httptest.Server.
	authorizeOverride func(claims *Claims, topic string) (string, error)

	federator Federator
	regionId  string

	// remoteSessions tracks sessions connected to other regional relays.
	// Keyed by topic -> list of SessionInfo.
	remoteMu       sync.RWMutex
	remoteSessions map[string][]SessionInfo
}

func NewRoomManager(m *melody.Melody) *RoomManager {
	return &RoomManager{
		melody:         m,
		topics:         make(map[string]map[*melody.Session]struct{}),
		authCache:      newAuthzCache(),
		remoteSessions: make(map[string][]SessionInfo),
	}
}

// Configure injects auth + API base. Called from main.go before routes
// start serving. Tests may leave these nil and override the dispatcher.
func (rm *RoomManager) Configure(auth *Auth, apiBase string) {
	rm.auth = auth
	rm.apiBase = apiBase
}

// ------------------------------------------------------------
// Melody callbacks
// ------------------------------------------------------------

func (rm *RoomManager) HandleConnect(s *melody.Session) {
	// Identity keys are stashed under temporary keys by the /ws handler
	// before the upgrade. Pull them out and cache into SessionKeys.
	sessionId := mustGetString(s, "sessionId")
	claimsVal, ok := s.Get("claims")
	var claims *Claims
	if ok {
		claims, _ = claimsVal.(*Claims)
	}
	keys := rm.cacheSessionKeys(s, sessionId, claims)

	logf(regionLocal, "[connect] session=%s user=%s", truncateID(keys.SessionID), keys.DisplayName())
}

func (rm *RoomManager) HandleMessage(s *melody.Session, msg []byte) {
	keys := getSessionKeys(s)
	if keys == nil {
		return
	}

	var op IncomingOp
	if err := json.Unmarshal(msg, &op); err != nil {
		writeError(s, ErrorMsg{Op: OpError, Code: ErrCodeBadRequest, Message: "invalid json"})
		return
	}

	// Fast-path validation: reject unknown ops before queueing.
	switch op.Op {
	case OpSubscribe, OpUnsubscribe, OpPublish:
	default:
		writeError(s, ErrorMsg{Op: OpError, Code: ErrCodeBadRequest, Message: "unknown op", Ref: op.Ref})
		return
	}

	// Push onto dispatcher queue. If it's full (pathological), drop and tell
	// the client — backpressure should never block melody's read pump.
	select {
	case keys.opCh <- op:
	default:
		writeError(s, ErrorMsg{Op: OpError, Code: ErrCodeRateLimited, Message: "op queue full", Ref: op.Ref})
	}
}

func (rm *RoomManager) HandleDisconnect(s *melody.Session) {
	keys := getSessionKeys(s)
	if keys == nil {
		return
	}

	// Stop the dispatcher first so no more ops mutate subs.
	close(keys.opCh)
	<-keys.opDone

	topics := keys.Subs.Snapshot()
	for _, topic := range topics {
		entry, _ := keys.Subs.Remove(topic)
		rm.removeFromTopic(topic, s)
		left := buildSessionEvent(EventSessionLeft, keys, topic, entry.Permission)
		if left != nil {
			rm.broadcastToTopic(topic, s, left)
		}
	}

	rm.authCache.InvalidateSession(keys.SessionID)

	logf(regionLocal, "[disconnect] session=%s user=%s topics=%d",
		truncateID(keys.SessionID), keys.DisplayName(), len(topics))
}

// ------------------------------------------------------------
// Op handlers (invoked by dispatcher goroutine)
// ------------------------------------------------------------

func (rm *RoomManager) handleSubscribe(s *melody.Session, keys *SessionKeys, op IncomingOp) {
	topic := op.Topic
	if _, _, err := parseTopic(topic); err != nil {
		writeError(s, ErrorMsg{Op: OpError, Topic: topic, Code: ErrCodeBadRequest, Message: err.Error(), Ref: op.Ref})
		return
	}

	// Idempotent re-subscribe: if already in subs, re-send ack with current
	// sessions list without touching authorize or broadcasting session_joined.
	if entry, ok := keys.Subs.Get(topic); ok {
		rm.writeSubscribedAck(s, keys, topic, entry.Permission, op.Ref)
		return
	}

	// Cap check.
	if keys.Subs.Len() >= MaxTopicsPerSession {
		writeError(s, ErrorMsg{Op: OpError, Topic: topic, Code: ErrCodeRateLimited,
			Message: "too many topics on this connection", Ref: op.Ref})
		return
	}

	// Rate-limit subscribe ops.
	if !keys.Subs.TryConsume() {
		writeError(s, ErrorMsg{Op: OpError, Topic: topic, Code: ErrCodeRateLimited,
			Message: "too many subscribe requests", Ref: op.Ref})
		return
	}

	// Authorize: check cache first, fall back to Next.js.
	cacheKey := authzCacheKey{SessionID: keys.SessionID, Topic: topic}
	permission, ok := rm.authCache.Get(cacheKey)
	if !ok {
		perm, err := rm.authorizeTopic(keys, topic)
		if err != nil {
			code := errorCodeFor(err)
			writeError(s, ErrorMsg{Op: OpError, Topic: topic, Code: code, Message: err.Error(), Ref: op.Ref})
			logf(regionLocal, "[sub-deny] session=%s topic=%s code=%s err=%v",
				truncateID(keys.SessionID), topicIDForLog(topic), code, err)
			return
		}
		permission = perm
		rm.authCache.Put(cacheKey, permission)
	}

	keys.Subs.Add(topic, permission)
	rm.addToTopic(topic, s)

	rm.writeSubscribedAck(s, keys, topic, permission, op.Ref)

	joined := buildSessionEvent(EventSessionJoined, keys, topic, permission)
	if joined != nil {
		rm.broadcastToTopic(topic, s, joined)
	}

	logf(regionLocal, "[sub] session=%s topic=%s permission=%s",
		truncateID(keys.SessionID), topicIDForLog(topic), permission)
}

func (rm *RoomManager) handleUnsubscribe(s *melody.Session, keys *SessionKeys, op IncomingOp) {
	topic := op.Topic
	entry, ok := keys.Subs.Remove(topic)
	if !ok {
		writeError(s, ErrorMsg{Op: OpError, Topic: topic, Code: ErrCodeNotSubscribed, Ref: op.Ref})
		return
	}

	rm.removeFromTopic(topic, s)
	rm.authCache.Invalidate(authzCacheKey{SessionID: keys.SessionID, Topic: topic})

	left := buildSessionEvent(EventSessionLeft, keys, topic, entry.Permission)
	if left != nil {
		rm.broadcastToTopic(topic, s, left)
	}

	ack, err := json.Marshal(UnsubscribedAck{Op: OpUnsubscribed, Topic: topic, Ref: op.Ref})
	if err == nil {
		_ = s.Write(ack)
	}

	logf(regionLocal, "[unsub] session=%s topic=%s", truncateID(keys.SessionID), topicIDForLog(topic))
}

func (rm *RoomManager) handlePublish(s *melody.Session, keys *SessionKeys, op IncomingOp) {
	topic := op.Topic
	entry, ok := keys.Subs.Get(topic)
	if !ok {
		// Silent drop for publishes with no ref, so a misbehaving client
		// does not spam errors. Ref-tagged publishes get an explicit error.
		if op.Ref != "" {
			writeError(s, ErrorMsg{Op: OpError, Topic: topic, Code: ErrCodeNotSubscribed, Ref: op.Ref})
		}
		return
	}

	if entry.Permission == "viewer" && isMutationEvent(op.Type) {
		logf(regionLocal, "[room] blocked mutation %s from viewer session=%s topic=%s",
			op.Type, truncateID(keys.SessionID), topicIDForLog(topic))
		return
	}

	if isStateEvent(op.Type) {
		logf(regionLocal, "[event] %s %s topic=%s by %s",
			op.Type, truncatePayloadForLog(op.Payload), topicIDForLog(topic), keys.DisplayName())
	}

	evt := TopicEvent{
		Op:        OpEvent,
		Topic:     topic,
		Type:      op.Type,
		SessionID: keys.SessionID,
		UserID:    keys.Claims.UserID,
		FirstName: keys.Claims.FirstName,
		Email:     keys.Claims.Email,
		Timestamp: time.Now().UnixMilli(),
		Payload:   op.Payload,
	}
	data, err := json.Marshal(evt)
	if err != nil {
		logf(regionLocal, "error marshalling event: %v", err)
		return
	}
	rm.broadcastToTopic(topic, s, data)
}

// authorizeTopic mints a fresh internal JWT and calls the Next.js dispatcher.
func (rm *RoomManager) authorizeTopic(keys *SessionKeys, topic string) (string, error) {
	if rm.authorizeOverride != nil {
		return rm.authorizeOverride(keys.Claims, topic)
	}
	if rm.auth == nil || rm.apiBase == "" {
		return "", ErrTopicTransient
	}
	bearer, err := rm.auth.MintInternalJWT(keys.Claims)
	if err != nil {
		return "", ErrTopicTransient
	}
	return AuthorizeTopic(rm.apiBase, topic, bearer)
}

func errorCodeFor(err error) string {
	switch {
	case errors.Is(err, ErrTopicForbidden):
		return ErrCodeForbidden
	case errors.Is(err, ErrTopicNotFound):
		return ErrCodeNotFound
	case errors.Is(err, ErrTopicBadRequest):
		return ErrCodeBadRequest
	default:
		return ErrCodeInternal
	}
}

func (rm *RoomManager) writeSubscribedAck(s *melody.Session, keys *SessionKeys, topic, permission, ref string) {
	sessions := rm.getSessionsInTopic(topic, keys.SessionID)
	ack := SubscribedAck{
		Op:         OpSubscribed,
		Topic:      topic,
		Permission: permission,
		SessionID:  keys.SessionID,
		Sessions:   sessions,
		Ref:        ref,
	}
	data, err := json.Marshal(ack)
	if err != nil {
		logf(regionLocal, "error marshalling subscribed ack: %v", err)
		return
	}
	_ = s.Write(data)
}

// ------------------------------------------------------------
// Topic membership + fan-out
// ------------------------------------------------------------

func (rm *RoomManager) addToTopic(topic string, s *melody.Session) {
	rm.mu.Lock()
	isFirst := rm.topics[topic] == nil
	if isFirst {
		rm.topics[topic] = make(map[*melody.Session]struct{})
	}
	rm.topics[topic][s] = struct{}{}
	rm.mu.Unlock()

	if isFirst && rm.federator != nil {
		rm.federator.Subscribe(topic, func(sourceRegion string, msg []byte) {
			rm.handleFederatedMessage(topic, sourceRegion, msg)
		})
		rm.requestPresenceSync(topic)
	}
}

func (rm *RoomManager) removeFromTopic(topic string, s *melody.Session) {
	rm.mu.Lock()
	members := rm.topics[topic]
	if members == nil {
		rm.mu.Unlock()
		return
	}
	delete(members, s)
	empty := len(members) == 0
	if empty {
		delete(rm.topics, topic)
	}
	rm.mu.Unlock()

	if empty && rm.federator != nil {
		rm.federator.Unsubscribe(topic)
		rm.remoteMu.Lock()
		delete(rm.remoteSessions, topic)
		rm.remoteMu.Unlock()
	}
}

// broadcastToTopic delivers locally and publishes to federation.
func (rm *RoomManager) broadcastToTopic(topic string, sender *melody.Session, msg []byte) {
	rm.mu.RLock()
	members := rm.topics[topic]
	for sess := range members {
		if sess != sender {
			_ = sess.Write(msg)
		}
	}
	rm.mu.RUnlock()

	if rm.federator != nil && msg != nil {
		if err := rm.federator.Publish(topic, msg); err != nil {
			logf(regionLocal, "[federation] publish error for topic=%s: %v", topicIDForLog(topic), err)
		}
	}
}

// broadcastToTopicLocal writes a message to all local sessions in a topic
// without re-publishing to federation. Used for cross-region message delivery.
func (rm *RoomManager) broadcastToTopicLocal(topic string, msg []byte) {
	rm.mu.RLock()
	members := rm.topics[topic]
	for sess := range members {
		_ = sess.Write(msg)
	}
	rm.mu.RUnlock()
}

func (rm *RoomManager) getSessionsInTopic(topic string, excludeSessionId string) []SessionInfo {
	rm.mu.RLock()
	members := rm.topics[topic]
	result := make([]SessionInfo, 0, len(members))
	for sess := range members {
		k := getSessionKeys(sess)
		if k == nil || k.Claims == nil {
			continue
		}
		if k.SessionID == excludeSessionId {
			continue
		}
		entry, ok := k.Subs.Get(topic)
		perm := ""
		if ok {
			perm = entry.Permission
		}
		result = append(result, SessionInfo{
			SessionID:  k.SessionID,
			UserID:     k.Claims.UserID,
			FirstName:  k.Claims.FirstName,
			Email:      k.Claims.Email,
			Permission: perm,
		})
	}
	rm.mu.RUnlock()

	if rm.federator != nil {
		rm.remoteMu.RLock()
		for _, rs := range rm.remoteSessions[topic] {
			if rs.SessionID != excludeSessionId {
				result = append(result, rs)
			}
		}
		rm.remoteMu.RUnlock()
	}

	return result
}

// ------------------------------------------------------------
// Event builders
// ------------------------------------------------------------

// buildSessionEvent constructs a session_joined / session_left TopicEvent
// scoped to a specific topic (because permission is per-topic now).
func buildSessionEvent(eventType string, keys *SessionKeys, topic, permission string) []byte {
	info := SessionInfo{
		SessionID:  keys.SessionID,
		UserID:     keys.Claims.UserID,
		FirstName:  keys.Claims.FirstName,
		Email:      keys.Claims.Email,
		Permission: permission,
	}
	evt := TopicEvent{
		Op:        OpEvent,
		Topic:     topic,
		Type:      eventType,
		SessionID: keys.SessionID,
		UserID:    keys.Claims.UserID,
		FirstName: keys.Claims.FirstName,
		Email:     keys.Claims.Email,
		Timestamp: time.Now().UnixMilli(),
		Payload:   info,
	}
	data, err := json.Marshal(evt)
	if err != nil {
		logf(regionLocal, "error marshalling %s event: %v", eventType, err)
		return nil
	}
	return data
}

func isMutationEvent(eventType string) bool {
	switch eventType {
	case "asset_moved", "asset_resized", "asset_added", "asset_removed",
		"asset_dragging", "asset_resizing", "asset_selected", "asset_deselected",
		"cell_selected", "cell_deselected", "cell_updated", "table_generating",
		"asset_z_changed",
		"pt_cell_selected", "pt_cell_deselected", "pt_cell_updated",
		"pt_cell_comment_updated",
		"pt_media_asset_added", "pt_media_asset_removed",
		"pt_column_added", "pt_column_removed", "pt_column_renamed", "pt_column_resized", "pt_columns_reordered",
		"pt_row_added", "pt_row_removed", "pt_row_resized", "pt_rows_reordered":
		return true
	}
	return false
}

func isStateEvent(eventType string) bool {
	switch eventType {
	case "asset_moved", "asset_resized", "asset_added", "asset_removed":
		return true
	}
	return false
}

// ------------------------------------------------------------
// Federation ingress
// ------------------------------------------------------------

// requestPresenceSync publishes a presence_sync_request so other relays
// reply with session_joined events for their local sessions in this topic.
// Called when the first local session joins a topic.
func (rm *RoomManager) requestPresenceSync(topic string) {
	msg, _ := json.Marshal(map[string]string{
		"op":    OpEvent,
		"type":  EventPresenceSync,
		"topic": topic,
	})
	if err := rm.federator.Publish(topic, msg); err != nil {
		logf(regionLocal, "[federation] presence sync request failed for topic=%s: %v",
			topicIDForLog(topic), err)
	}
}

// publishLocalPresence replies to a presence_sync_request from another region
// with session_joined events for each local subscriber in that topic.
func (rm *RoomManager) publishLocalPresence(topic string) {
	rm.mu.RLock()
	members := rm.topics[topic]
	events := make([][]byte, 0, len(members))
	for sess := range members {
		k := getSessionKeys(sess)
		if k == nil || k.Claims == nil {
			continue
		}
		entry, ok := k.Subs.Get(topic)
		perm := ""
		if ok {
			perm = entry.Permission
		}
		if evt := buildSessionEvent(EventSessionJoined, k, topic, perm); evt != nil {
			events = append(events, evt)
		}
	}
	rm.mu.RUnlock()

	for _, evt := range events {
		_ = rm.federator.Publish(topic, evt)
	}
}

// handleFederatedMessage processes a message received from another region.
// It updates the remote-sessions map for presence events, filters out any
// payload whose embedded topic doesn't match the NATS subject (defense in
// depth), and fans out to local subscribers.
func (rm *RoomManager) handleFederatedMessage(topic string, sourceRegion string, msg []byte) {
	topicLog := topicIDForLog(topic)

	var peek struct {
		Op        string          `json:"op"`
		Topic     string          `json:"topic"`
		Type      string          `json:"type"`
		FirstName string          `json:"firstName"`
		Email     string          `json:"email"`
		SessionID string          `json:"sessionId"`
		Payload   json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(msg, &peek); err == nil {
		// Defense in depth: reject cross-wired payloads.
		if peek.Topic != "" && peek.Topic != topic {
			logf(sourceRegion, "[federation] topic mismatch subject=%s payload=%s; dropping",
				topicLog, topicIDForLog(peek.Topic))
			return
		}
		if peek.Type == EventPresenceSync {
			rm.publishLocalPresence(topic)
			return
		}

		switch peek.Type {
		case EventSessionJoined:
			var info SessionInfo
			if json.Unmarshal(peek.Payload, &info) == nil && info.SessionID != "" {
				rm.remoteMu.Lock()
				rm.remoteSessions[topic] = appendRemoteSession(rm.remoteSessions[topic], info)
				rm.remoteMu.Unlock()
			}
			logf(sourceRegion, "[room] %s joined topic=%s", displayName(peek.FirstName, peek.Email), topicLog)
		case EventSessionLeft:
			rm.remoteMu.Lock()
			rm.remoteSessions[topic] = removeRemoteSession(rm.remoteSessions[topic], peek.SessionID)
			rm.remoteMu.Unlock()
			logf(sourceRegion, "[room] %s left topic=%s", displayName(peek.FirstName, peek.Email), topicLog)
		}

		if isStateEvent(peek.Type) {
			logf(sourceRegion, "[event] %s %s topic=%s by %s",
				peek.Type, truncatePayloadForLog(peek.Payload), topicLog, displayName(peek.FirstName, peek.Email))
		}
	}

	rm.broadcastToTopicLocal(topic, msg)
}

func appendRemoteSession(sessions []SessionInfo, info SessionInfo) []SessionInfo {
	for _, s := range sessions {
		if s.SessionID == info.SessionID {
			return sessions
		}
	}
	return append(sessions, info)
}

func removeRemoteSession(sessions []SessionInfo, sessionId string) []SessionInfo {
	for i, s := range sessions {
		if s.SessionID == sessionId {
			return append(sessions[:i], sessions[i+1:]...)
		}
	}
	return sessions
}

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------

func writeError(s *melody.Session, err ErrorMsg) {
	data, mErr := json.Marshal(err)
	if mErr != nil {
		return
	}
	_ = s.Write(data)
}

func mustGetString(s *melody.Session, key string) string {
	v, ok := s.Get(key)
	if !ok {
		return ""
	}
	str, ok := v.(string)
	if !ok {
		return ""
	}
	return str
}

func truncatePayloadForLog(payload json.RawMessage) string {
	if len(payload) == 0 {
		return "{}"
	}
	s := string(payload)
	if len(s) > 80 {
		return s[:80] + "..."
	}
	return s
}

func truncateID(id string) string {
	id = strings.TrimPrefix(id, "session_")
	if len(id) <= 8 {
		return id
	}
	return id[:8]
}

func displayName(firstName string, email string) string {
	if firstName = strings.TrimSpace(firstName); firstName != "" {
		return firstName
	}
	if email = strings.TrimSpace(email); email != "" {
		return email
	}
	return "unknown-user"
}

// topicIDForLog returns a shortened form of a topic string suitable for logs
// (keeps namespace, truncates id to first 8 chars).
func topicIDForLog(topic string) string {
	topic = strings.TrimSpace(topic)
	if topic == "" {
		return "unknown"
	}
	parts := strings.SplitN(topic, ":", 2)
	if len(parts) != 2 {
		if len(topic) <= 8 {
			return topic
		}
		return topic[:8]
	}
	prefix := strings.TrimSpace(parts[0])
	id := strings.TrimSpace(parts[1])
	if id == "" {
		if prefix == "" {
			return "unknown"
		}
		return prefix
	}
	if len(id) > 8 {
		id = id[:8]
	}
	if prefix == "" {
		return id
	}
	return prefix + ":" + id
}
