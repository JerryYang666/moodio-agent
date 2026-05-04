package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ------------------------------------------------------------
// validateJWT
// ------------------------------------------------------------

func TestValidateJWT_AcceptsSignedToken(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}
	claims := &Claims{
		UserID:    "user-1",
		Email:     "e@example.com",
		FirstName: "Alice",
		Exp:       time.Now().Add(5 * time.Minute).Unix(),
		Iat:       time.Now().Unix(),
	}
	token := signTestJWT(t, a.jwtSecret, claims)

	got, err := a.validateJWT(token)
	if err != nil {
		t.Fatalf("validateJWT: %v", err)
	}
	if got.UserID != "user-1" || got.FirstName != "Alice" {
		t.Fatalf("unexpected claims: %+v", got)
	}
}

func TestValidateJWT_ExpiredToken(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}
	claims := &Claims{
		UserID: "user-1",
		Exp:    time.Now().Add(-1 * time.Minute).Unix(),
	}
	token := signTestJWT(t, a.jwtSecret, claims)

	if _, err := a.validateJWT(token); err == nil {
		t.Fatal("expected expired token to be rejected")
	}
}

func TestValidateJWT_WrongSignature(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}
	claims := &Claims{UserID: "user-1", Exp: time.Now().Add(5 * time.Minute).Unix()}
	// Sign with a different secret.
	token := signTestJWT(t, []byte("other-secret"), claims)

	if _, err := a.validateJWT(token); err == nil {
		t.Fatal("expected bad-signature token to be rejected")
	}
}

func TestValidateJWT_MalformedToken(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}

	cases := []string{
		"",
		"a.b",            // only 2 segments
		"a.b.c.d",        // 4 segments
		"x.y.z",          // not base64url
		"bad base64.payload.sig",
	}
	for _, c := range cases {
		if _, err := a.validateJWT(c); err == nil {
			t.Errorf("validateJWT(%q) should fail", c)
		}
	}
}

func TestValidateJWT_MissingUserID(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}
	claims := &Claims{
		Email: "e@example.com",
		Exp:   time.Now().Add(5 * time.Minute).Unix(),
	}
	token := signTestJWT(t, a.jwtSecret, claims)

	if _, err := a.validateJWT(token); err == nil {
		t.Fatal("expected token without userId to be rejected")
	}
}

// ------------------------------------------------------------
// ValidateFromCookie
// ------------------------------------------------------------

func TestValidateFromCookie_Success(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}
	claims := &Claims{UserID: "user-1", Exp: time.Now().Add(5 * time.Minute).Unix()}
	token := signTestJWT(t, a.jwtSecret, claims)

	r := httptest.NewRequest(http.MethodGet, "http://x", nil)
	r.AddCookie(&http.Cookie{Name: "moodio_access_token", Value: token})

	got, err := a.ValidateFromCookie(r)
	if err != nil {
		t.Fatalf("ValidateFromCookie: %v", err)
	}
	if got.UserID != "user-1" {
		t.Fatalf("unexpected userId: %s", got.UserID)
	}
}

func TestValidateFromCookie_MissingCookie(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}
	r := httptest.NewRequest(http.MethodGet, "http://x", nil)
	if _, err := a.ValidateFromCookie(r); err == nil {
		t.Fatal("expected missing cookie to be rejected")
	}
}

func TestValidateFromCookie_BadCookieValue(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}
	r := httptest.NewRequest(http.MethodGet, "http://x", nil)
	r.AddCookie(&http.Cookie{Name: "moodio_access_token", Value: "not-a-jwt"})
	if _, err := a.ValidateFromCookie(r); err == nil {
		t.Fatal("expected bad cookie to be rejected")
	}
}

// ------------------------------------------------------------
// MintInternalJWT
// ------------------------------------------------------------

func TestMintInternalJWT_RoundTrip(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}
	claims := &Claims{UserID: "user-1", FirstName: "Alice"}

	tok, err := a.MintInternalJWT(claims)
	if err != nil {
		t.Fatalf("MintInternalJWT: %v", err)
	}

	payload := decodeTestJWTPayload(t, tok)
	if payload["userId"] != "user-1" {
		t.Errorf("expected userId=user-1, got %v", payload["userId"])
	}
	if payload["aud"] != realtimeInternalAudience {
		t.Errorf("expected aud=%s, got %v", realtimeInternalAudience, payload["aud"])
	}
	iat, _ := payload["iat"].(float64)
	exp, _ := payload["exp"].(float64)
	if exp <= iat {
		t.Errorf("exp (%v) must be after iat (%v)", exp, iat)
	}
	if int64(exp)-int64(iat) != int64(internalJWTTTL.Seconds()) {
		t.Errorf("expected exp-iat == %ds, got %d",
			int64(internalJWTTTL.Seconds()), int64(exp)-int64(iat))
	}

	// Signature must verify under the same secret.
	if !verifyTestJWTSignature(t, a.jwtSecret, tok) {
		t.Error("signature must verify under the minting secret")
	}
	// And NOT verify under a different secret.
	if verifyTestJWTSignature(t, []byte("other"), tok) {
		t.Error("signature must NOT verify under a different secret")
	}
}

func TestMintInternalJWT_RequiresUserID(t *testing.T) {
	a := &Auth{jwtSecret: []byte("test-secret")}

	if _, err := a.MintInternalJWT(nil); err == nil {
		t.Error("nil claims should error")
	}
	if _, err := a.MintInternalJWT(&Claims{}); err == nil {
		t.Error("empty userId should error")
	}
}

// ------------------------------------------------------------
// AuthorizeTopic — status code → sentinel mapping
// ------------------------------------------------------------

func TestAuthorizeTopic_Success(t *testing.T) {
	srv := newMockNextJS(t, map[string]mockResponse{
		"desktop:ok": {status: 200, body: `{"permission":"editor"}`},
	})
	defer srv.Close()

	perm, err := AuthorizeTopic(srv.URL, "desktop:ok", "fake-bearer")
	if err != nil {
		t.Fatalf("AuthorizeTopic: %v", err)
	}
	if perm != "editor" {
		t.Errorf("expected editor, got %q", perm)
	}
}

func TestAuthorizeTopic_ErrorMapping(t *testing.T) {
	srv := newMockNextJS(t, map[string]mockResponse{
		"desktop:400": {status: 400, body: ""},
		"desktop:401": {status: 401, body: ""},
		"desktop:403": {status: 403, body: ""},
		"desktop:404": {status: 404, body: ""},
		"desktop:500": {status: 500, body: ""},
	})
	defer srv.Close()

	cases := []struct {
		topic   string
		wantErr error
	}{
		{"desktop:400", ErrTopicBadRequest},
		{"desktop:401", ErrTopicForbidden},
		{"desktop:403", ErrTopicForbidden},
		{"desktop:404", ErrTopicNotFound},
		{"desktop:500", ErrTopicTransient},
	}
	for _, c := range cases {
		_, err := AuthorizeTopic(srv.URL, c.topic, "fake-bearer")
		if err == nil {
			t.Errorf("%s: expected error, got nil", c.topic)
			continue
		}
		if !errors.Is(err, c.wantErr) {
			t.Errorf("%s: expected sentinel %v, got %v", c.topic, c.wantErr, err)
		}
	}
}

func TestAuthorizeTopic_NetworkError(t *testing.T) {
	// Point at a port nothing is listening on — should be a transient error.
	_, err := AuthorizeTopic("http://127.0.0.1:1", "desktop:x", "fake-bearer")
	if err == nil {
		t.Fatal("expected error from unreachable host")
	}
	if !errors.Is(err, ErrTopicTransient) {
		t.Errorf("expected transient sentinel, got %v", err)
	}
}

func TestAuthorizeTopic_EmptyPermissionIsTransient(t *testing.T) {
	srv := newMockNextJS(t, map[string]mockResponse{
		"desktop:empty": {status: 200, body: `{"permission":""}`},
	})
	defer srv.Close()

	_, err := AuthorizeTopic(srv.URL, "desktop:empty", "fake-bearer")
	if err == nil {
		t.Fatal("expected error for empty permission")
	}
	if !errors.Is(err, ErrTopicTransient) {
		t.Errorf("expected transient sentinel, got %v", err)
	}
}

func TestAuthorizeTopic_InvalidJSONIsTransient(t *testing.T) {
	srv := newMockNextJS(t, map[string]mockResponse{
		"desktop:junk": {status: 200, body: `not json`},
	})
	defer srv.Close()

	_, err := AuthorizeTopic(srv.URL, "desktop:junk", "fake-bearer")
	if err == nil {
		t.Fatal("expected error for junk body")
	}
	if !errors.Is(err, ErrTopicTransient) {
		t.Errorf("expected transient sentinel, got %v", err)
	}
}

func TestAuthorizeTopic_ForwardsBearerAndTopic(t *testing.T) {
	// Capture what the server actually received.
	var gotBearer, gotTopic string
	mux := http.NewServeMux()
	mux.HandleFunc("/api/realtime/authorize", func(w http.ResponseWriter, r *http.Request) {
		gotBearer = r.Header.Get("Authorization")
		gotTopic = r.URL.Query().Get("topic")
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"permission":"owner"}`)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	_, err := AuthorizeTopic(srv.URL, "desktop:weird chars!", "bearer-abc")
	if err != nil {
		t.Fatalf("AuthorizeTopic: %v", err)
	}
	if gotBearer != "Bearer bearer-abc" {
		t.Errorf("expected Bearer header, got %q", gotBearer)
	}
	if gotTopic != "desktop:weird chars!" {
		t.Errorf("expected topic to be URL-decoded on the server, got %q", gotTopic)
	}
}

// ------------------------------------------------------------
// generateSessionId
// ------------------------------------------------------------

func TestGenerateSessionId(t *testing.T) {
	ids := map[string]struct{}{}
	for i := 0; i < 100; i++ {
		id := generateSessionId()
		if !strings.HasPrefix(id, "session_") {
			t.Fatalf("missing prefix: %s", id)
		}
		if _, dup := ids[id]; dup {
			t.Fatalf("collision: %s", id)
		}
		ids[id] = struct{}{}
	}
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

type mockResponse struct {
	status int
	body   string
}

// newMockNextJS builds an httptest.Server that mirrors the real
// /api/realtime/authorize endpoint. Responses are keyed by topic query.
func newMockNextJS(t *testing.T, responses map[string]mockResponse) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/realtime/authorize", func(w http.ResponseWriter, r *http.Request) {
		topic := r.URL.Query().Get("topic")
		resp, ok := responses[topic]
		if !ok {
			http.Error(w, "no stub for topic", http.StatusNotImplemented)
			return
		}
		if resp.body != "" {
			w.Header().Set("Content-Type", "application/json")
		}
		w.WriteHeader(resp.status)
		if resp.body != "" {
			io.WriteString(w, resp.body)
		}
	})
	return httptest.NewServer(mux)
}

// signTestJWT signs an HS256 JWT with the given secret and payload. Mirrors
// what the real JS auth layer produces.
func signTestJWT(t *testing.T, secret []byte, claims *Claims) string {
	t.Helper()
	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	hBytes, _ := json.Marshal(header)
	pBytes, _ := json.Marshal(claims)
	signingInput := base64URLEncode(hBytes) + "." + base64URLEncode(pBytes)

	// Use the shared hmac helper by constructing via Auth.MintInternalJWT
	// would embed aud; instead, do it manually.
	sig := hmacSign(t, secret, signingInput)
	return signingInput + "." + sig
}

func hmacSign(t *testing.T, secret []byte, input string) string {
	t.Helper()
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(input))
	return base64URLEncode(m.Sum(nil))
}

// verifyTestJWTSignature checks whether a JWT's signature validates under a
// given secret.
func verifyTestJWTSignature(t *testing.T, secret []byte, token string) bool {
	t.Helper()
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}
	want, err := base64URLDecode(parts[2])
	if err != nil {
		return false
	}
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(parts[0] + "." + parts[1]))
	got := m.Sum(nil)
	return hmac.Equal(want, got)
}

func decodeTestJWTPayload(t *testing.T, token string) map[string]any {
	t.Helper()
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 parts, got %d", len(parts))
	}
	raw, err := base64URLDecode(parts[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	return m
}
