package main

import (

	"ejp-backend/pkg/config"
	"ejp-backend/internal/routes"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Logger
	logger.Init()

	// 1. Load Configuration
	config.LoadConfig()

	// 2. Connect to Database & Redis
	config.ConnectDB()
	config.ConnectRedis()

	// 3. Initialize WebSocket Hub
	ws.InitGlobalHub()


	// 5. Initialize Gin Router
	router := gin.Default()

	// 6. Setup Routes
	routes.SetupRoutes(router)

	// 7. Start API Server
	logger.Info("Starting API Server on port 8000...")
	if err := router.Run(":8000"); err != nil {
		logger.Fatal("Failed to start server", "error", err)
	}
}




