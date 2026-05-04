package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/olahol/melody"
)

// buildHandshakeFixture stands up the real /ws handshake handler (the one
// production main.go uses) wired to a real melody + RoomManager with
// authorize stubbed out so the test exercises only the cookie-validation
// + upgrade path.
func buildHandshakeFixture(t *testing.T, secret []byte) *httptest.Server {
	t.Helper()
	m := melody.New()
	m.Config.MaxMessageSize = 4096

	rooms := NewRoomManager(m)
	rooms.authorizeOverride = func(*Claims, string) (string, error) {
		return "editor", nil
	}
	auth := &Auth{jwtSecret: secret}
	rooms.Configure(auth, "http://unused")

	m.HandleConnect(func(s *melody.Session) { rooms.HandleConnect(s) })
	m.HandleMessage(func(s *melody.Session, msg []byte) { rooms.HandleMessage(s, msg) })
	m.HandleDisconnect(func(s *melody.Session) { rooms.HandleDisconnect(s) })

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/connection", wsHandshakeHandler(auth, m))

	return httptest.NewServer(mux)
}

func TestWSHandshake_ValidCookieUpgrades(t *testing.T) {
	secret := []byte("handshake-test-secret")
	srv := buildHandshakeFixture(t, secret)
	defer srv.Close()

	claims := &Claims{
		UserID:    "user-1",
		FirstName: "Jerry",
		Email:     "j@example.com",
		Exp:       time.Now().Add(5 * time.Minute).Unix(),
	}
	token := signTestJWT(t, secret, claims)

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/connection"
	header := http.Header{}
	header.Set("Cookie", "moodio_access_token="+token)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("valid cookie must upgrade: %v", err)
	}
	defer conn.Close()

	// Upgrade succeeded; we should be able to subscribe.
	writeJSON(t, conn, map[string]any{"op": "subscribe", "topic": "desktop:x", "ref": "r1"})
	ack := readUntil(t, conn, 2*time.Second, func(raw []byte) bool {
		return strings.Contains(string(raw), `"op":"subscribed"`)
	})
	if ack == nil {
		t.Fatal("expected subscribed ack")
	}
}

func TestWSHandshake_MissingCookie(t *testing.T) {
	srv := buildHandshakeFixture(t, []byte("handshake-test-secret"))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/connection"
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		conn.Close()
		t.Fatal("expected handshake failure without cookie")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("expected 401, got %d", status)
	}
}

func TestWSHandshake_BadCookie(t *testing.T) {
	srv := buildHandshakeFixture(t, []byte("handshake-test-secret"))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/connection"
	header := http.Header{}
	header.Set("Cookie", "moodio_access_token=not-a-jwt")

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err == nil {
		conn.Close()
		t.Fatal("expected handshake failure with bad cookie")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("expected 401, got %d", status)
	}
}

func TestWSHandshake_CookieSignedWithDifferentSecret(t *testing.T) {
	srv := buildHandshakeFixture(t, []byte("handshake-test-secret"))
	defer srv.Close()

	// Sign with a different secret — the handshake must reject.
	claims := &Claims{
		UserID: "user-1",
		Exp:    time.Now().Add(5 * time.Minute).Unix(),
	}
	token := signTestJWT(t, []byte("other-secret"), claims)

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/connection"
	header := http.Header{}
	header.Set("Cookie", "moodio_access_token="+token)

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err == nil {
		conn.Close()
		t.Fatal("expected handshake rejection for wrong-secret cookie")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("expected 401, got %d", status)
	}
}

func TestWSHandshake_ExpiredCookie(t *testing.T) {
	secret := []byte("handshake-test-secret")
	srv := buildHandshakeFixture(t, secret)
	defer srv.Close()

	claims := &Claims{
		UserID: "user-1",
		Exp:    time.Now().Add(-1 * time.Minute).Unix(),
	}
	token := signTestJWT(t, secret, claims)

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/connection"
	header := http.Header{}
	header.Set("Cookie", "moodio_access_token="+token)

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err == nil {
		conn.Close()
		t.Fatal("expected handshake rejection for expired cookie")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("expected 401, got %d", status)
	}
}
