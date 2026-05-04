package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Claims struct {
	UserID    string `json:"userId"`
	Email     string `json:"email"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Exp       int64  `json:"exp"`
	Iat       int64  `json:"iat"`
}

type Auth struct {
	jwtSecret []byte
}

// Sentinel errors returned by AuthorizeTopic. They map 1:1 to wire error codes.
var (
	ErrTopicForbidden  = errors.New("forbidden")
	ErrTopicNotFound   = errors.New("not_found")
	ErrTopicBadRequest = errors.New("bad_request")
	ErrTopicTransient  = errors.New("internal")
)

// realtimeInternalAudience is the JWT audience used for bearer tokens minted
// by the relay and accepted by /api/realtime/authorize. User access JWTs do
// not carry this audience, so the authorize endpoint is effectively
// relay-only even though it lives on the public Next.js server.
const realtimeInternalAudience = "realtime-internal"

const internalJWTTTL = 60 * time.Second

// authHTTPClient is shared across authorize calls so connection reuse kicks in.
var authHTTPClient = &http.Client{Timeout: 5 * time.Second}

func (a *Auth) ValidateFromCookie(r *http.Request) (*Claims, error) {
	cookie, err := r.Cookie("moodio_access_token")
	if err != nil {
		return nil, fmt.Errorf("missing access token cookie: %w", err)
	}
	return a.validateJWT(cookie.Value)
}

func (a *Auth) validateJWT(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	headerAndPayload := parts[0] + "." + parts[1]
	signature, err := base64URLDecode(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid signature encoding: %w", err)
	}

	mac := hmac.New(sha256.New, a.jwtSecret)
	mac.Write([]byte(headerAndPayload))
	expectedSig := mac.Sum(nil)

	if !hmac.Equal(signature, expectedSig) {
		return nil, fmt.Errorf("invalid signature")
	}

	payloadBytes, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid payload encoding: %w", err)
	}

	var claims Claims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("invalid payload JSON: %w", err)
	}

	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("token expired")
	}

	if claims.UserID == "" {
		return nil, fmt.Errorf("missing userId in token")
	}

	return &claims, nil
}

// MintInternalJWT issues a short-lived HS256 bearer token for calling the
// Next.js authorize endpoint. The token carries aud="realtime-internal" and
// the user's identity; the authorize endpoint rejects tokens without this
// audience, so the endpoint cannot be exercised with a stolen browser cookie.
func (a *Auth) MintInternalJWT(claims *Claims) (string, error) {
	if claims == nil || claims.UserID == "" {
		return "", fmt.Errorf("cannot mint internal JWT without userId")
	}
	now := time.Now()
	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	payload := map[string]any{
		"userId": claims.UserID,
		"aud":    realtimeInternalAudience,
		"iat":    now.Unix(),
		"exp":    now.Add(internalJWTTTL).Unix(),
	}
	hBytes, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	pBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	signingInput := base64URLEncode(hBytes) + "." + base64URLEncode(pBytes)

	mac := hmac.New(sha256.New, a.jwtSecret)
	mac.Write([]byte(signingInput))
	sig := mac.Sum(nil)

	return signingInput + "." + base64URLEncode(sig), nil
}

// AuthorizeTopic calls the Next.js dispatcher to check per-topic permission.
// The bearer token must be a short-lived internal JWT minted via MintInternalJWT.
// Returns the permission string ("owner"|"editor"|"viewer") or one of the
// sentinel errors above.
func AuthorizeTopic(apiBase, topic, internalJWT string) (string, error) {
	endpoint := fmt.Sprintf("%s/api/realtime/authorize?topic=%s",
		strings.TrimRight(apiBase, "/"),
		url.QueryEscape(topic),
	)
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("%w: build request: %v", ErrTopicTransient, err)
	}
	req.Header.Set("Authorization", "Bearer "+internalJWT)

	resp, err := authHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: authorize call failed: %v", ErrTopicTransient, err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", fmt.Errorf("%w: read body: %v", ErrTopicTransient, err)
		}
		var parsed struct {
			Permission string `json:"permission"`
		}
		if err := json.Unmarshal(body, &parsed); err != nil {
			return "", fmt.Errorf("%w: invalid authorize response: %v", ErrTopicTransient, err)
		}
		if parsed.Permission == "" {
			return "", fmt.Errorf("%w: empty permission in authorize response", ErrTopicTransient)
		}
		return parsed.Permission, nil
	case http.StatusBadRequest:
		return "", fmt.Errorf("%w: authorize 400", ErrTopicBadRequest)
	case http.StatusUnauthorized:
		return "", fmt.Errorf("%w: authorize 401 (bearer rejected)", ErrTopicForbidden)
	case http.StatusForbidden:
		return "", fmt.Errorf("%w: authorize 403 (no access)", ErrTopicForbidden)
	case http.StatusNotFound:
		return "", fmt.Errorf("%w: authorize 404", ErrTopicNotFound)
	default:
		return "", fmt.Errorf("%w: authorize returned %d", ErrTopicTransient, resp.StatusCode)
	}
}

func base64URLDecode(s string) ([]byte, error) {
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}

func base64URLEncode(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func generateSessionId() string {
	return "session_" + uuid.New().String()
}
