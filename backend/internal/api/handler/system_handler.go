package handler

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"

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

// HealthCheck probes Postgres and Redis. Returns 503 when any dependency is down
// so orchestrators stop routing traffic to a broken API process.
func (h *SystemHandler) HealthCheck(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	checks := gin.H{
		"postgres": "ok",
		"redis":    "ok",
	}
	healthy := true

	if config.DB == nil {
		checks["postgres"] = "unavailable"
		healthy = false
	} else {
		sqlDB, err := config.DB.DB()
		if err != nil {
			checks["postgres"] = "unavailable"
			healthy = false
		} else if err := sqlDB.PingContext(ctx); err != nil {
			checks["postgres"] = "down"
			healthy = false
		}
	}

	if config.Redis == nil {
		checks["redis"] = "unavailable"
		healthy = false
	} else if err := config.Redis.Ping(ctx).Err(); err != nil {
		checks["redis"] = "down"
		healthy = false
	}

	if !healthy {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":    "error",
			"message":   "unhealthy",
			"data":      checks,
			"timestamp": time.Now().Unix(),
		})
		return
	}

	helper.SendSuccess(c, "OK", checks)
}

func (h *SystemHandler) ServeWS(c *gin.Context) {
	responseHeader := http.Header{}
	if proto, ok := c.Get("wsSubprotocol"); ok {
		if protocol, isString := proto.(string); isString && protocol != "" {
			// Echo negotiated auth subprotocol — required by browsers when client offers one.
			responseHeader.Set("Sec-WebSocket-Protocol", protocol)
		}
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, responseHeader)
	if err != nil {
		log.Printf("WebSocket Upgrade Error: %v", err)
		return
	}

	userID, _ := c.Get("userID")
	roleVal, _ := c.Get("role")
	role, _ := roleVal.(string)

	client := &ws.Client{
		Hub:    ws.GlobalHub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		UserID: userID.(uint),
		Role:   role,
	}
	client.Hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
