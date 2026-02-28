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
	melody *melody.Melody
	mu     sync.RWMutex
	rooms  map[string]map[*melody.Session]struct{}
}

func NewRoomManager(m *melody.Melody) *RoomManager {
	return &RoomManager{
		melody: m,
		rooms:  make(map[string]map[*melody.Session]struct{}),
	}
}

func (rm *RoomManager) addToRoom(roomId string, s *melody.Session) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if rm.rooms[roomId] == nil {
		rm.rooms[roomId] = make(map[*melody.Session]struct{})
	}
	rm.rooms[roomId][s] = struct{}{}
}

func (rm *RoomManager) removeFromRoom(roomId string, s *melody.Session) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	members := rm.rooms[roomId]
	if members == nil {
		return
	}
	delete(members, s)
	if len(members) == 0 {
		delete(rm.rooms, roomId)
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

	rm.broadcastToRoom(keys.RoomID, s, buildSessionEvent("session_joined", s))
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

	rm.broadcastToRoom(keys.RoomID, s, buildSessionEvent("session_left", s))
}

// broadcastToRoom writes directly to room members, bypassing Melody's
// global BroadcastFilter which iterates over every session on the server.
func (rm *RoomManager) broadcastToRoom(roomId string, sender *melody.Session, msg []byte) {
	rm.mu.RLock()
	members := rm.rooms[roomId]
	for s := range members {
		if s != sender {
			s.Write(msg)
		}
	}
	rm.mu.RUnlock()
}

func (rm *RoomManager) getSessionsInRoom(roomId string, excludeSessionId string) []SessionInfo {
	rm.mu.RLock()
	members := rm.rooms[roomId]
	if len(members) == 0 {
		rm.mu.RUnlock()
		return nil
	}
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
		"asset_dragging", "asset_selected", "asset_deselected":
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
