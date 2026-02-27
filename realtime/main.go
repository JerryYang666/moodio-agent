package main

import (
	"log"
	"net/http"
	"os"

	"github.com/olahol/melody"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	jwtSecret := os.Getenv("JWT_ACCESS_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_ACCESS_SECRET environment variable is required")
	}

	permissionAPIBase := os.Getenv("PERMISSION_API_BASE")
	if permissionAPIBase == "" {
		permissionAPIBase = "http://localhost:3000"
	}

	m := melody.New()
	m.Config.MaxMessageSize = 4096

	auth := &Auth{jwtSecret: []byte(jwtSecret)}
	rooms := &RoomManager{melody: m}

	http.HandleFunc("/ws/desktop/{desktopId}", func(w http.ResponseWriter, r *http.Request) {
		claims, err := auth.ValidateFromCookie(r)
		if err != nil {
			log.Printf("[auth] rejected connection: %v", err)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		desktopId := r.PathValue("desktopId")
		if desktopId == "" {
			http.Error(w, "missing desktopId", http.StatusBadRequest)
			return
		}

		permission, err := checkPermission(permissionAPIBase, desktopId, claims.UserID, r)
		if err != nil || permission == "" {
			log.Printf("[auth] permission denied for user=%s desktop=%s: %v", claims.UserID, desktopId, err)
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		sessionId := generateSessionId()
		log.Printf("[connect] user=%s (%s) -> desktop=%s session=%s permission=%s",
			claims.FirstName, claims.UserID[:8], desktopId[:8], sessionId, permission)

		err = m.HandleRequestWithKeys(w, r, map[string]any{
			"sessionId":  sessionId,
			"userId":     claims.UserID,
			"firstName":  claims.FirstName,
			"email":      claims.Email,
			"permission": permission,
			"roomId":     desktopId,
		})
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
		}
	})

	m.HandleConnect(func(s *melody.Session) {
		rooms.HandleConnect(s)
	})

	m.HandleMessage(func(s *melody.Session, msg []byte) {
		rooms.HandleMessage(s, msg)
	})

	m.HandleDisconnect(func(s *melody.Session) {
		rooms.HandleDisconnect(s)
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	log.Printf("Realtime server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
