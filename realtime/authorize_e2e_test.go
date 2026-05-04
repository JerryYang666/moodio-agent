package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/olahol/melody"
)

// TestAuthorizeE2E_RealRoundTrip spins up a fake Next.js on loopback and a
// full melody relay that does NOT use authorizeOverride. This exercises the
// MintInternalJWT → HTTP call → verify-bearer → authorizeTopic pipeline
// exactly as production runs it, minus the database. If any part of the
// internal bearer contract breaks (signature, audience, expiry, route
// mounting), this test fails.
func TestAuthorizeE2E_RealRoundTrip(t *testing.T) {
	secret := []byte("e2e-test-secret")

	var authCalls atomic.Int32
	var lastBearer atomic.Value // string

	nextjs := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/realtime/authorize" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		authCalls.Add(1)

		authz := r.Header.Get("Authorization")
		lastBearer.Store(authz)
		if !strings.HasPrefix(authz, "Bearer ") {
			http.Error(w, "missing bearer", http.StatusUnauthorized)
			return
		}
		bearer := strings.TrimPrefix(authz, "Bearer ")

		payload, ok := verifyInternalBearerForTest(secret, bearer)
		if !ok {
			http.Error(w, "invalid bearer", http.StatusUnauthorized)
			return
		}
		if payload["aud"] != realtimeInternalAudience {
			http.Error(w, "wrong audience", http.StatusUnauthorized)
			return
		}
		userId, _ := payload["userId"].(string)
		if userId == "" {
			http.Error(w, "missing userId", http.StatusUnauthorized)
			return
		}

		topic := r.URL.Query().Get("topic")
		switch topic {
		case "desktop:granted":
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, `{"permission":"editor"}`)
		case "desktop:denied":
			http.Error(w, "forbidden", http.StatusForbidden)
		default:
			http.Error(w, "bad request", http.StatusBadRequest)
		}
	}))
	defer nextjs.Close()

	// Real relay wired up like main.go does — identity only at handshake,
	// no authorizeOverride.
	m := melody.New()
	m.Config.MaxMessageSize = 4096
	rooms := NewRoomManager(m)
	auth := &Auth{jwtSecret: secret}
	rooms.Configure(auth, nextjs.URL)

	m.HandleConnect(func(s *melody.Session) { rooms.HandleConnect(s) })
	m.HandleMessage(func(s *melody.Session, msg []byte) { rooms.HandleMessage(s, msg) })
	m.HandleDisconnect(func(s *melody.Session) { rooms.HandleDisconnect(s) })

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/connection", func(w http.ResponseWriter, r *http.Request) {
		// In e2e, skip the real cookie path and inject Claims directly so we
		// isolate the authorize leg from the cookie-validation leg (which
		// has its own tests).
		claims := &Claims{
			UserID:    "user-e2e",
			FirstName: "Jerry",
			Email:     "jerry@test.com",
		}
		m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId": generateSessionId(),
			"claims":    claims,
		})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/connection"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	// --- subscribe to a granted topic ---
	writeJSON(t, conn, map[string]any{"op": "subscribe", "topic": "desktop:granted", "ref": "r1"})
	grantedAck := readUntil(t, conn, 2*time.Second, func(raw []byte) bool {
		var m map[string]any
		if json.Unmarshal(raw, &m) != nil {
			return false
		}
		return m["op"] == "subscribed" && m["topic"] == "desktop:granted"
	})
	if grantedAck == nil {
		t.Fatal("expected subscribed ack for desktop:granted")
	}
	var grantedEnv SubscribedAck
	_ = json.Unmarshal(grantedAck, &grantedEnv)
	if grantedEnv.Permission != "editor" {
		t.Errorf("expected editor, got %q", grantedEnv.Permission)
	}

	// --- subscribe to a denied topic ---
	writeJSON(t, conn, map[string]any{"op": "subscribe", "topic": "desktop:denied", "ref": "r2"})
	errFrame := readUntil(t, conn, 2*time.Second, func(raw []byte) bool {
		var m map[string]any
		if json.Unmarshal(raw, &m) != nil {
			return false
		}
		return m["op"] == "error" && m["ref"] == "r2"
	})
	if errFrame == nil {
		t.Fatal("expected error frame for desktop:denied")
	}
	var errEnv ErrorMsg
	_ = json.Unmarshal(errFrame, &errEnv)
	if errEnv.Code != ErrCodeForbidden {
		t.Errorf("expected forbidden, got %s: %s", errEnv.Code, errEnv.Message)
	}

	if got := authCalls.Load(); got != 2 {
		t.Errorf("expected 2 authorize calls, got %d", got)
	}

	// The bearer we received must look like a real JWT with our audience.
	last, _ := lastBearer.Load().(string)
	bearer := strings.TrimPrefix(last, "Bearer ")
	parts := strings.Split(bearer, ".")
	if len(parts) != 3 {
		t.Fatalf("bearer must have 3 segments, got %d", len(parts))
	}
	if !verifyTestJWTSignature(t, secret, bearer) {
		t.Error("bearer signature must validate under the shared secret")
	}
}

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

func writeJSON(t *testing.T, conn *websocket.Conn, obj map[string]any) {
	t.Helper()
	data, _ := json.Marshal(obj)
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write: %v", err)
	}
}

// readUntil reads messages until `match` returns true or the deadline fires.
func readUntil(t *testing.T, conn *websocket.Conn, timeout time.Duration, match func([]byte) bool) []byte {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(timeout))
	defer conn.SetReadDeadline(time.Time{})
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return nil
		}
		if match(raw) {
			return raw
		}
	}
}

// verifyInternalBearerForTest mimics the jose-based verify that Next.js does:
// HMAC-SHA256 against `secret`, return the decoded payload if valid and not
// expired.
func verifyInternalBearerForTest(secret []byte, token string) (map[string]any, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, false
	}
	sig, err := base64URLDecode(parts[2])
	if err != nil {
		return nil, false
	}
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(sig, m.Sum(nil)) {
		return nil, false
	}
	raw, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, false
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, false
	}
	if exp, ok := payload["exp"].(float64); ok {
		if time.Now().Unix() > int64(exp) {
			return nil, false
		}
	}
	return payload, true
}
