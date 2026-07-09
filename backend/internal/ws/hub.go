package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"ejp-backend/pkg/config"
)

const RedisChannel = "ejp_updates"

// Hub maintains the set of active clients and broadcasts messages to them.
type Hub struct {
	// Registered clients by UserID
	Clients map[uint]map[*Client]bool

	// Inbound messages from the clients or Redis.
	Broadcast chan Message

	// Register requests from the clients.
	Register chan *Client

	// Unregister requests from clients.
	Unregister chan *Client

	mu sync.RWMutex
}

// Message represents the data structure for broadcasting
type Message struct {
	UserID uint        `json:"user_id,omitempty"`
	JobID  string      `json:"job_id,omitempty"`
	Type   string      `json:"type"` // e.g., "job_update", "notification", "worker_update"
	Data   interface{} `json:"data"`
}

func NewHub() *Hub {
	return &Hub{
		Broadcast:  make(chan Message),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Clients:    make(map[uint]map[*Client]bool),
	}
}

func (h *Hub) Run() {
	// 1. Start Redis Subscription if Redis is available
	if config.Redis != nil {
		go h.listenToRedis()
	}

	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			if h.Clients[client.UserID] == nil {
				h.Clients[client.UserID] = make(map[*Client]bool)
			}
			h.Clients[client.UserID][client] = true
			h.mu.Unlock()

		case client := <-h.Unregister:
			h.mu.Lock()
			if connections, ok := h.Clients[client.UserID]; ok {
				if _, ok := connections[client]; ok {
					delete(connections, client)
					close(client.Send)
					if len(connections) == 0 {
						delete(h.Clients, client.UserID)
					}
				}
			}
			h.mu.Unlock()

		case message := <-h.Broadcast:
			h.broadcastLocal(message)
		}
	}
}

func (h *Hub) listenToRedis() {
	pubsub := config.Redis.Subscribe(context.Background(), RedisChannel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		var message Message
		if err := json.Unmarshal([]byte(msg.Payload), &message); err != nil {
			log.Printf("WebSocket: Failed to unmarshal Redis message: %v", err)
			continue
		}
		// Push to local broadcast channel
		h.Broadcast <- message
	}
}

func (h *Hub) broadcastLocal(message Message) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// If UserID is 0, it's a global/admin broadcast
	if message.UserID == 0 {
		h.broadcastGlobal(message)
		return
	}

	connections := h.Clients[message.UserID]
	if connections != nil {
		jsonMsg, _ := json.Marshal(message)
		for client := range connections {
			select {
			case client.Send <- jsonMsg:
			default:
				close(client.Send)
				delete(connections, client)
			}
		}
	}
}

func (h *Hub) broadcastGlobal(message Message) {
	jsonMsg, _ := json.Marshal(message)
	for _, connections := range h.Clients {
		for client := range connections {
			select {
			case client.Send <- jsonMsg:
			default:
			}
		}
	}
}

// GlobalHub is the instance of the hub to be used across the application
var GlobalHub *Hub

func InitGlobalHub() {
	GlobalHub = NewHub()
	go GlobalHub.Run()
}

// BroadcastToAdmins sends a message to all connected clients (UserID 0 logic)
func (h *Hub) BroadcastToAdmins(msgType string, data interface{}) {
	msg := Message{
		UserID: 0,
		Type:   msgType,
		Data:   data,
	}

	// Publish to Redis so all API instances hear it
	if config.Redis != nil {
		payload, _ := json.Marshal(msg)
		config.Redis.Publish(context.Background(), RedisChannel, payload)
	} else {
		// Fallback to local if no Redis
		h.Broadcast <- msg
	}
}

// BroadcastToUser sends a message via Redis Pub/Sub (Global)
func (h *Hub) BroadcastToUser(userID uint, msgType string, data interface{}) {
	msg := Message{
		UserID: userID,
		Type:   msgType,
		Data:   data,
	}

	// Publish to Redis so all API instances hear it
	if config.Redis != nil {
		payload, _ := json.Marshal(msg)
		config.Redis.Publish(context.Background(), RedisChannel, payload)
	} else {
		// Fallback to local if no Redis
		h.Broadcast <- msg
	}
}

// HasActiveConnections returns true if there are any active WebSocket connections.
// Thread-safe wrapper protecting map reads.
func (h *Hub) HasActiveConnections() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.Clients) > 0
}



