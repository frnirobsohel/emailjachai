package handler

import (
	"ejp-backend/internal/helper"
	"ejp-backend/internal/ws"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // Allow non-browser clients
		}
		allowedOriginsEnv := os.Getenv("CORS_ORIGINS")
		if allowedOriginsEnv == "" {
			allowedOriginsEnv = "http://localhost:3000,http://localhost:8000"
		}
		for _, allowed := range strings.Split(allowedOriginsEnv, ",") {
			if strings.TrimSpace(allowed) == origin {
				return true
			}
		}
		log.Printf("WebSocket: rejected origin %s", origin)
		return false
	},
}

type SystemHandler struct{}

func NewSystemHandler() *SystemHandler {
	return &SystemHandler{}
}

func (h *SystemHandler) Ping(c *gin.Context) {
	helper.SendSuccess(c, "pong", nil)
}

func (h *SystemHandler) HealthCheck(c *gin.Context) {
	helper.SendSuccess(c, "OK", nil)
}

func (h *SystemHandler) ServeWS(c *gin.Context) {
	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket Upgrade Error: %v", err)
		return
	}

	userID, _ := c.Get("userID")

	client := &ws.Client{
		Hub:    ws.GlobalHub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		UserID: userID.(uint),
	}
	client.Hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
