package main

import (
	"encoding/json"
	"log"
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

type RoomManager struct {
	melody *melody.Melody
}

func (rm *RoomManager) HandleConnect(s *melody.Session) {
	roomId := mustGetString(s, "roomId")
	sessionId := mustGetString(s, "sessionId")
	firstName := mustGetString(s, "firstName")

	sessions := rm.getSessionsInRoom(roomId, sessionId)

	log.Printf("[room] %s joined room=%s (%d other sessions present)", firstName, roomId[:8], len(sessions))

	joined := RoomJoinedEvent{
		Type:      "room_joined",
		SessionID: sessionId,
		Sessions:  sessions,
	}
	data, err := json.Marshal(joined)
	if err != nil {
		log.Printf("Error marshalling room_joined: %v", err)
		return
	}
	s.Write(data)

	rm.broadcastToRoom(roomId, s, buildSessionEvent("session_joined", s))
}

func (rm *RoomManager) HandleMessage(s *melody.Session, msg []byte) {
	roomId := mustGetString(s, "roomId")
	permission := mustGetString(s, "permission")

	var incoming IncomingEvent
	if err := json.Unmarshal(msg, &incoming); err != nil {
		log.Printf("Invalid message from session: %v", err)
		return
	}

	if permission == "viewer" && isMutationEvent(incoming.Type) {
		log.Printf("[room] blocked mutation %s from viewer session=%s", incoming.Type, mustGetString(s, "sessionId"))
		return
	}

	if isStateEvent(incoming.Type) {
		log.Printf("[event] %s %s in room=%s by %s",
			incoming.Type, truncatePayloadForLog(incoming.Payload), roomId[:8], mustGetString(s, "firstName"))
	}

	stamped := rm.stampIdentity(s, &incoming)
	data, err := json.Marshal(stamped)
	if err != nil {
		log.Printf("Error marshalling stamped event: %v", err)
		return
	}

	rm.broadcastToRoom(roomId, s, data)
}

func (rm *RoomManager) HandleDisconnect(s *melody.Session) {
	roomId := mustGetString(s, "roomId")
	firstName := mustGetString(s, "firstName")
	sessionId := mustGetString(s, "sessionId")

	remaining := rm.getSessionsInRoom(roomId, sessionId)
	log.Printf("[room] %s left room=%s (%d sessions remaining)", firstName, roomId[:8], len(remaining))

	rm.broadcastToRoom(roomId, s, buildSessionEvent("session_left", s))
}

func (rm *RoomManager) broadcastToRoom(roomId string, sender *melody.Session, msg []byte) {
	rm.melody.BroadcastFilter(msg, func(q *melody.Session) bool {
		qRoom, ok := q.Get("roomId")
		return ok && qRoom == roomId && q != sender
	})
}

func (rm *RoomManager) getSessionsInRoom(roomId string, excludeSessionId string) []SessionInfo {
	allSessions, err := rm.melody.Sessions()
	if err != nil {
		return nil
	}

	var result []SessionInfo
	for _, s := range allSessions {
		r, ok := s.Get("roomId")
		if !ok || r != roomId {
			continue
		}
		sid := mustGetString(s, "sessionId")
		if sid == excludeSessionId {
			continue
		}
		result = append(result, SessionInfo{
			SessionID:  sid,
			UserID:     mustGetString(s, "userId"),
			FirstName:  mustGetString(s, "firstName"),
			Email:      mustGetString(s, "email"),
			Permission: mustGetString(s, "permission"),
		})
	}
	return result
}

func (rm *RoomManager) stampIdentity(s *melody.Session, event *IncomingEvent) *OutgoingEvent {
	return &OutgoingEvent{
		Type:      event.Type,
		SessionID: mustGetString(s, "sessionId"),
		UserID:    mustGetString(s, "userId"),
		FirstName: mustGetString(s, "firstName"),
		Email:     mustGetString(s, "email"),
		Timestamp: time.Now().UnixMilli(),
		Payload:   event.Payload,
	}
}

func buildSessionEvent(eventType string, s *melody.Session) []byte {
	event := OutgoingEvent{
		Type:      eventType,
		SessionID: mustGetString(s, "sessionId"),
		UserID:    mustGetString(s, "userId"),
		FirstName: mustGetString(s, "firstName"),
		Email:     mustGetString(s, "email"),
		Timestamp: time.Now().UnixMilli(),
		Payload: SessionInfo{
			SessionID:  mustGetString(s, "sessionId"),
			UserID:     mustGetString(s, "userId"),
			FirstName:  mustGetString(s, "firstName"),
			Email:      mustGetString(s, "email"),
			Permission: mustGetString(s, "permission"),
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
