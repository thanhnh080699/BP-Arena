package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type RoomHub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]struct{}
}

type roomEvent struct {
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	CreatedAt time.Time   `json:"created_at"`
}

func NewRoomHub() *RoomHub {
	return &RoomHub{
		clients: make(map[*websocket.Conn]struct{}),
	}
}

var roomUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func (h *RoomHub) Serve(c *gin.Context) {
	conn, err := roomUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("room websocket upgrade failed: %v", err)
		return
	}

	h.mu.Lock()
	h.clients[conn] = struct{}{}
	h.mu.Unlock()

	_ = conn.WriteJSON(roomEvent{
		Type:      "rooms.connected",
		Payload:   gin.H{"ok": true},
		CreatedAt: time.Now(),
	})

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}

	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()
	_ = conn.Close()
}

func (h *RoomHub) Broadcast(eventType string, payload interface{}) {
	if h == nil {
		return
	}

	message, err := json.Marshal(roomEvent{
		Type:      eventType,
		Payload:   payload,
		CreatedAt: time.Now(),
	})
	if err != nil {
		log.Printf("room websocket marshal failed: %v", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
			_ = conn.Close()
			delete(h.clients, conn)
		}
	}
}
