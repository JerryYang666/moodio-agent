package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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

func base64URLDecode(s string) ([]byte, error) {
	// JWT base64url omits padding
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}

func generateSessionId() string {
	return "session_" + uuid.New().String()
}

// checkPermission calls the Next.js API to verify the user's permission on a desktop.
// It forwards the original cookies so the Next.js auth middleware can validate.
func checkPermission(apiBase, desktopId, userId string, originalReq *http.Request) (string, error) {
	url := fmt.Sprintf("%s/api/desktop/%s/permission?userId=%s", apiBase, desktopId, userId)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}

	// Forward cookies from the original WS handshake request
	for _, c := range originalReq.Cookies() {
		req.AddCookie(c)
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("permission check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("permission denied (status %d)", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var result struct {
		Permission string `json:"permission"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Permission, nil
}
