package handler

import (
	"ejp-backend/internal/helper"
	"ejp-backend/internal/ws"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
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

	client := &ws.Client{
		Hub:    ws.GlobalHub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		UserID: 1, // Default for now, should be from token
	}
	client.Hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
