package handler

import (
	"log"
	"net/http"
	"os"

	"ejp-backend/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// In production, you should restrict this to your frontend domain
		return true
	},
}

// ServeWS handles websocket requests from the peer.
func ServeWS(c *gin.Context) {
	// 1. Authenticate via token in query parameter
	tokenString := c.Query("token")
	if tokenString == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication token required"})
		return
	}

	// Parse JWT
	secret := os.Getenv("JWT_SECRET")
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})

	if err != nil || !token.Valid {
		log.Printf("WebSocket Auth Error: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authentication token"})
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
		return
	}

	userIDFloat, ok := claims["userID"].(float64)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in token"})
		return
	}
	userID := uint(userIDFloat)

	// 2. Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket Upgrade Error: %v", err)
		return
	}

	// 3. Register client
	client := &ws.Client{
		Hub:    ws.GlobalHub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		UserID: userID,
	}
	client.Hub.Register <- client

	// 4. Start pumps
	go client.WritePump()
	go client.ReadPump()
}



