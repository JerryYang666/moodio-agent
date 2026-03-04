package main

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/olahol/melody"
)

type SessionInfo struct {
	SessionID  string `json:"sessionId"`
	UserID     string `json:"userId"`
	FirstName  string `json:"firstName"`
	Email      string `json:"email"`
	Permission string `json:"permission"`
}

type OutgoingEvent struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	UserID    string `json:"userId"`
	FirstName string `json:"firstName"`
	Email     string `json:"email"`
	Timestamp int64  `json:"timestamp"`
	Payload   any    `json:"payload,omitempty"`
}

type IncomingEvent struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type RoomJoinedEvent struct {
	Type      string        `json:"type"`
	SessionID string        `json:"sessionId"`
	Sessions  []SessionInfo `json:"sessions"`
}

// SessionKeys caches all session metadata at connect time so we never
// need to call Session.Get (which acquires a per-session RWMutex) on the
// hot path.
type SessionKeys struct {
	SessionID  string
	UserID     string
	FirstName  string
	Email      string
	Permission string
	RoomID     string
}

const sessionKeysKey = "__keys"

func cacheSessionKeys(s *melody.Session) *SessionKeys {
	keys := &SessionKeys{
		SessionID:  mustGetString(s, "sessionId"),
		UserID:     mustGetString(s, "userId"),
		FirstName:  mustGetString(s, "firstName"),
		Email:      mustGetString(s, "email"),
		Permission: mustGetString(s, "permission"),
		RoomID:     mustGetString(s, "roomId"),
	}
	s.Set(sessionKeysKey, keys)
	return keys
}

func getSessionKeys(s *melody.Session) *SessionKeys {
	v, ok := s.Get(sessionKeysKey)
	if !ok {
		return cacheSessionKeys(s)
	}
	keys, ok := v.(*SessionKeys)
	if !ok {
		return cacheSessionKeys(s)
	}
	return keys
}

type RoomManager struct {
	melody    *melody.Melody
	mu        sync.RWMutex
	rooms     map[string]map[*melody.Session]struct{}
	federator Federator
	regionId  string
	// remoteSessions tracks sessions connected to other regional relays.
	// Keyed by roomId -> list of SessionInfo.
	remoteMu       sync.RWMutex
	remoteSessions map[string][]SessionInfo
}

func NewRoomManager(m *melody.Melody) *RoomManager {
	return &RoomManager{
		melody:         m,
		rooms:          make(map[string]map[*melody.Session]struct{}),
		remoteSessions: make(map[string][]SessionInfo),
	}
}

func (rm *RoomManager) addToRoom(roomId string, s *melody.Session) {
	rm.mu.Lock()
	isFirstSession := rm.rooms[roomId] == nil
	if isFirstSession {
		rm.rooms[roomId] = make(map[*melody.Session]struct{})
	}
	rm.rooms[roomId][s] = struct{}{}
	rm.mu.Unlock()

	if isFirstSession && rm.federator != nil {
		rm.federator.Subscribe(roomId, func(msg []byte) {
			rm.handleFederatedMessage(roomId, msg)
		})
	}
}

func (rm *RoomManager) removeFromRoom(roomId string, s *melody.Session) {
	rm.mu.Lock()
	members := rm.rooms[roomId]
	if members == nil {
		rm.mu.Unlock()
		return
	}
	delete(members, s)
	isEmpty := len(members) == 0
	if isEmpty {
		delete(rm.rooms, roomId)
	}
	rm.mu.Unlock()

	if isEmpty && rm.federator != nil {
		rm.federator.Unsubscribe(roomId)
		rm.remoteMu.Lock()
		delete(rm.remoteSessions, roomId)
		rm.remoteMu.Unlock()
	}
}

func (rm *RoomManager) HandleConnect(s *melody.Session) {
	keys := cacheSessionKeys(s)

	rm.addToRoom(keys.RoomID, s)

	sessions := rm.getSessionsInRoom(keys.RoomID, keys.SessionID)

	log.Printf("[room] %s joined room=%s (%d other sessions present)", keys.FirstName, keys.RoomID[:8], len(sessions))

	joined := RoomJoinedEvent{
		Type:      "room_joined",
		SessionID: keys.SessionID,
		Sessions:  sessions,
	}
	data, err := json.Marshal(joined)
	if err != nil {
		log.Printf("Error marshalling room_joined: %v", err)
		return
	}
	s.Write(data)

	sessionEvent := buildSessionEvent("session_joined", s)
	rm.broadcastToRoom(keys.RoomID, s, sessionEvent)
}

func (rm *RoomManager) HandleMessage(s *melody.Session, msg []byte) {
	keys := getSessionKeys(s)

	var incoming IncomingEvent
	if err := json.Unmarshal(msg, &incoming); err != nil {
		log.Printf("Invalid message from session: %v", err)
		return
	}

	if keys.Permission == "viewer" && isMutationEvent(incoming.Type) {
		log.Printf("[room] blocked mutation %s from viewer session=%s", incoming.Type, keys.SessionID)
		return
	}

	if isStateEvent(incoming.Type) {
		log.Printf("[event] %s %s in room=%s by %s",
			incoming.Type, truncatePayloadForLog(incoming.Payload), keys.RoomID[:8], keys.FirstName)
	}

	stamped := stampIdentity(keys, &incoming)
	data, err := json.Marshal(stamped)
	if err != nil {
		log.Printf("Error marshalling stamped event: %v", err)
		return
	}

	rm.broadcastToRoom(keys.RoomID, s, data)
}

func (rm *RoomManager) HandleDisconnect(s *melody.Session) {
	keys := getSessionKeys(s)

	rm.removeFromRoom(keys.RoomID, s)

	remaining := rm.getSessionsInRoom(keys.RoomID, keys.SessionID)
	log.Printf("[room] %s left room=%s (%d sessions remaining)", keys.FirstName, keys.RoomID[:8], len(remaining))

	sessionEvent := buildSessionEvent("session_left", s)
	rm.broadcastToRoom(keys.RoomID, s, sessionEvent)
}

// broadcastToRoom writes directly to room members, bypassing Melody's
// global BroadcastFilter which iterates over every session on the server.
// After local delivery, it publishes to the federation layer (if enabled)
// so other regional relays can forward the message to their local clients.
func (rm *RoomManager) broadcastToRoom(roomId string, sender *melody.Session, msg []byte) {
	rm.mu.RLock()
	members := rm.rooms[roomId]
	for s := range members {
		if s != sender {
			s.Write(msg)
		}
	}
	rm.mu.RUnlock()

	if rm.federator != nil && msg != nil {
		if err := rm.federator.Publish(roomId, msg); err != nil {
			log.Printf("[federation] publish error for room=%s: %v", roomId, err)
		}
	}
}

// broadcastToRoomLocal writes a message to all local sessions in a room
// without publishing back to the federation layer. Used for messages
// received from other regions via NATS.
func (rm *RoomManager) broadcastToRoomLocal(roomId string, msg []byte) {
	rm.mu.RLock()
	members := rm.rooms[roomId]
	for s := range members {
		s.Write(msg)
	}
	rm.mu.RUnlock()
}

func (rm *RoomManager) getSessionsInRoom(roomId string, excludeSessionId string) []SessionInfo {
	rm.mu.RLock()
	members := rm.rooms[roomId]
	result := make([]SessionInfo, 0, len(members))
	for s := range members {
		k := getSessionKeys(s)
		if k.SessionID == excludeSessionId {
			continue
		}
		result = append(result, SessionInfo{
			SessionID:  k.SessionID,
			UserID:     k.UserID,
			FirstName:  k.FirstName,
			Email:      k.Email,
			Permission: k.Permission,
		})
	}
	rm.mu.RUnlock()

	if rm.federator != nil {
		rm.remoteMu.RLock()
		for _, rs := range rm.remoteSessions[roomId] {
			if rs.SessionID != excludeSessionId {
				result = append(result, rs)
			}
		}
		rm.remoteMu.RUnlock()
	}

	return result
}

func stampIdentity(keys *SessionKeys, event *IncomingEvent) *OutgoingEvent {
	return &OutgoingEvent{
		Type:      event.Type,
		SessionID: keys.SessionID,
		UserID:    keys.UserID,
		FirstName: keys.FirstName,
		Email:     keys.Email,
		Timestamp: time.Now().UnixMilli(),
		Payload:   event.Payload,
	}
}

func buildSessionEvent(eventType string, s *melody.Session) []byte {
	k := getSessionKeys(s)
	event := OutgoingEvent{
		Type:      eventType,
		SessionID: k.SessionID,
		UserID:    k.UserID,
		FirstName: k.FirstName,
		Email:     k.Email,
		Timestamp: time.Now().UnixMilli(),
		Payload: SessionInfo{
			SessionID:  k.SessionID,
			UserID:     k.UserID,
			FirstName:  k.FirstName,
			Email:      k.Email,
			Permission: k.Permission,
		},
	}
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Error marshalling %s event: %v", eventType, err)
		return nil
	}
	return data
}

func isMutationEvent(eventType string) bool {
	switch eventType {
	case "asset_moved", "asset_resized", "asset_added", "asset_removed",
		"asset_dragging", "asset_resizing", "asset_selected", "asset_deselected",
		"cell_selected", "cell_deselected", "cell_updated", "table_generating":
		return true
	}
	return false
}

func isStateEvent(eventType string) bool {
	switch eventType {
	case "asset_moved", "asset_resized", "asset_added", "asset_removed",
		"cell_updated":
		return true
	}
	return false
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

// handleFederatedMessage processes messages received from other regions via
// NATS. It updates the remote sessions map for presence events and broadcasts
// the message to all local sessions in the room.
func (rm *RoomManager) handleFederatedMessage(roomId string, msg []byte) {
	var event struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(msg, &event); err == nil {
		switch event.Type {
		case "session_joined":
			var full OutgoingEvent
			if err := json.Unmarshal(msg, &full); err == nil {
				payloadBytes, _ := json.Marshal(full.Payload)
				var info SessionInfo
				if json.Unmarshal(payloadBytes, &info) == nil && info.SessionID != "" {
					rm.remoteMu.Lock()
					rm.remoteSessions[roomId] = appendRemoteSession(rm.remoteSessions[roomId], info)
					rm.remoteMu.Unlock()
				}
			}
		case "session_left":
			var full OutgoingEvent
			if err := json.Unmarshal(msg, &full); err == nil {
				rm.remoteMu.Lock()
				rm.remoteSessions[roomId] = removeRemoteSession(rm.remoteSessions[roomId], full.SessionID)
				rm.remoteMu.Unlock()
			}
		}
	}

	rm.broadcastToRoomLocal(roomId, msg)
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
