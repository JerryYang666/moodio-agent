package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Op codes on the wire.
const (
	OpSubscribe    = "subscribe"
	OpUnsubscribe  = "unsubscribe"
	OpPublish      = "publish"
	OpSubscribed   = "subscribed"
	OpUnsubscribed = "unsubscribed"
	OpEvent        = "event"
	OpError        = "error"
)

// Error codes returned on the wire inside ErrorMsg.
const (
	ErrCodeForbidden     = "forbidden"
	ErrCodeNotFound      = "not_found"
	ErrCodeBadRequest    = "bad_request"
	ErrCodeRateLimited   = "rate_limited"
	ErrCodeNotSubscribed = "not_subscribed"
	ErrCodeInternal      = "internal"
)

// Allowed topic namespaces. Defense-in-depth: Next.js also validates.
var allowedTopicNamespaces = map[string]bool{
	"desktop":          true,
	"production-table": true,
}

var topicIDRegex = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// SessionInfo is embedded in subscribed acks and session presence events.
// Permission is the session's permission on the specific topic carrying this info.
type SessionInfo struct {
	SessionID  string `json:"sessionId"`
	UserID     string `json:"userId"`
	FirstName  string `json:"firstName"`
	Email      string `json:"email"`
	Permission string `json:"permission"`
}

// IncomingOp is the single envelope for all client -> server messages.
type IncomingOp struct {
	Op      string          `json:"op"`
	Topic   string          `json:"topic,omitempty"`
	Type    string          `json:"type,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Ref     string          `json:"ref,omitempty"`
}

// SubscribedAck is sent after a successful subscribe; it subsumes the old
// room_joined frame by carrying the existing sessions list.
type SubscribedAck struct {
	Op         string        `json:"op"`
	Topic      string        `json:"topic"`
	Permission string        `json:"permission"`
	SessionID  string        `json:"sessionId"`
	Sessions   []SessionInfo `json:"sessions"`
	Ref        string        `json:"ref,omitempty"`
}

type UnsubscribedAck struct {
	Op    string `json:"op"`
	Topic string `json:"topic"`
	Ref   string `json:"ref,omitempty"`
}

type ErrorMsg struct {
	Op      string `json:"op"`
	Topic   string `json:"topic,omitempty"`
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
	Ref     string `json:"ref,omitempty"`
}

// TopicEvent is the envelope for every topic-scoped event broadcast to
// subscribers (both regular events and session_joined/session_left).
type TopicEvent struct {
	Op        string `json:"op"`
	Topic     string `json:"topic"`
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	UserID    string `json:"userId"`
	FirstName string `json:"firstName"`
	Email     string `json:"email"`
	Timestamp int64  `json:"timestamp"`
	Payload   any    `json:"payload,omitempty"`
}

// parseTopic validates a topic string of the form "<namespace>:<id>".
// Returns the namespace, id, and nil on success; otherwise an error suitable
// for a bad_request error response.
func parseTopic(topic string) (ns, id string, err error) {
	topic = strings.TrimSpace(topic)
	if topic == "" {
		return "", "", fmt.Errorf("topic is empty")
	}
	parts := strings.SplitN(topic, ":", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("topic must be <namespace>:<id>")
	}
	ns = parts[0]
	id = parts[1]
	if ns == "" || id == "" {
		return "", "", fmt.Errorf("topic namespace and id must be non-empty")
	}
	if !allowedTopicNamespaces[ns] {
		return "", "", fmt.Errorf("unknown topic namespace: %s", ns)
	}
	if !topicIDRegex.MatchString(id) {
		return "", "", fmt.Errorf("invalid topic id")
	}
	return ns, id, nil
}
