package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/olahol/melody"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	jwtSecret := os.Getenv("JWT_ACCESS_SECRET")
	if jwtSecret == "" {
		fatalf(regionLocal, "JWT_ACCESS_SECRET environment variable is required")
	}

	apiBase := os.Getenv("PERMISSION_API_BASE")
	if apiBase == "" {
		apiBase = "http://localhost:3000"
	}

	m := melody.New()
	m.Config.MaxMessageSize = 65536

	auth := &Auth{jwtSecret: []byte(jwtSecret)}
	rooms := NewRoomManager(m)
	rooms.Configure(auth, apiBase)

	// Federation: auto-enable if NATS_URL is configured.
	if natsURL := os.Getenv("NATS_URL"); natsURL != "" {
		regionId := os.Getenv("REGION_ID")
		if regionId == "" {
			regionId = fetchEC2Region()
			if regionId == "unknown" {
				regionId = "no-region"
			}
			logf(regionLocal, "[federation] auto-detected region: %s", regionId)
		}

		fed, err := NewNATSFederator(natsURL, regionId)
		if err != nil {
			logf(regionLocal, "[federation] NATS unavailable at %s, running without federation: %v", natsURL, err)
		} else {
			rooms.federator = fed
			rooms.regionId = regionId
			defer fed.Close()
			logf(regionLocal, "[federation] enabled (region=%s, nats=%s)", regionId, natsURL)
		}
	}

	// Single multiplexed WebSocket endpoint. Identity is verified via the
	// moodio_access_token cookie on handshake; the verified Claims are cached
	// on the session for the lifetime of the connection. Topic authorization
	// happens per-subscribe over the wire, not at handshake.
	//
	// Path lives under /ws/ so existing Nginx location blocks route it
	// correctly without any config change.
	http.HandleFunc("/ws/connection", wsHandshakeHandler(auth, m))

	m.HandleConnect(func(s *melody.Session) {
		rooms.HandleConnect(s)
	})
	m.HandleMessage(func(s *melody.Session, msg []byte) {
		rooms.HandleMessage(s, msg)
	})
	m.HandleDisconnect(func(s *melody.Session) {
		rooms.HandleDisconnect(s)
	})

	// Unauthenticated latency echo endpoint used by the admin page.
	pingMelody := melody.New()
	pingMelody.Config.MaxMessageSize = 512
	pingMelody.HandleMessage(func(s *melody.Session, msg []byte) {
		s.Write(msg)
	})
	http.HandleFunc("/ws/ping", func(w http.ResponseWriter, r *http.Request) {
		if err := pingMelody.HandleRequest(w, r); err != nil {
			logf(regionLocal, "ping WebSocket upgrade error: %v", err)
		}
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	http.HandleFunc("/check", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		logf(regionLocal, "[check] received check request from %s", r.RemoteAddr)

		region := fetchEC2Region()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"status": "ok",
			"region": region,
		})
	})

	logf(regionLocal, "realtime server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fatalf(regionLocal, "listen error: %v", err)
	}
}

// wsHandshakeHandler returns the /ws HTTP handler. Factored out of main so
// tests can mount it against an httptest.Server without invoking main().
func wsHandshakeHandler(auth *Auth, m *melody.Melody) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, err := auth.ValidateFromCookie(r)
		if err != nil {
			logf(regionLocal, "[auth] rejected connection: %v", err)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		sessionId := generateSessionId()

		err = m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId": sessionId,
			"claims":    claims,
		})
		if err != nil {
			logf(regionLocal, "WebSocket upgrade error: %v", err)
		}
	}
}

func fetchEC2Region() string {
	client := &http.Client{}

	tokenReq, err := http.NewRequest(http.MethodPut, "http://169.254.169.254/latest/api/token", nil)
	if err != nil {
		logf(regionLocal, "[check] failed to create token request: %v", err)
		return "unknown"
	}
	tokenReq.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", "21600")

	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		logf(regionLocal, "[check] failed to fetch IMDSv2 token: %v", err)
		return "unknown"
	}
	defer tokenResp.Body.Close()

	tokenBytes, err := io.ReadAll(tokenResp.Body)
	if err != nil {
		logf(regionLocal, "[check] failed to read token response: %v", err)
		return "unknown"
	}
	token := strings.TrimSpace(string(tokenBytes))

	regionReq, err := http.NewRequest(http.MethodGet, "http://169.254.169.254/latest/meta-data/placement/region", nil)
	if err != nil {
		logf(regionLocal, "[check] failed to create region request: %v", err)
		return "unknown"
	}
	regionReq.Header.Set("X-aws-ec2-metadata-token", token)

	regionResp, err := client.Do(regionReq)
	if err != nil {
		logf(regionLocal, "[check] failed to fetch region: %v", err)
		return "unknown"
	}
	defer regionResp.Body.Close()

	regionBytes, err := io.ReadAll(regionResp.Body)
	if err != nil {
		logf(regionLocal, "[check] failed to read region response: %v", err)
		return "unknown"
	}

	region := strings.TrimSpace(string(regionBytes))
	if region == "" {
		return "unknown"
	}
	return region
}
