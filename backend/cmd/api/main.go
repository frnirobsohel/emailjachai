package main

import (
	"os"

	"ejp-backend/internal/api/middleware"
	"ejp-backend/internal/api/validator"
	"ejp-backend/internal/routes"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Logger
	logger.Init()

	// Register custom validation tags (not_disposable, valid_domain, ipv4_or_ipv6, etc.)
	validator.Init()

	// 1. Load Configuration
	config.LoadConfig()

	// 2. Connect to Database & Redis
	config.ConnectDB()
	config.ConnectRedis()

	// 3. Initialize WebSocket Hub
	ws.InitGlobalHub()

	// 4. Configure Gin mode based on environment
	if os.Getenv("GO_ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 5. Initialize Gin Router (gin.New() instead of gin.Default() to avoid duplicate logging)
	router := gin.New()
	router.Use(middleware.Logger()) // Custom Zap logger middleware
	router.Use(gin.Recovery()) // Panic recovery middleware

	// 6. Setup Routes
	routes.SetupRoutes(router)

	// 7. Start API Server
	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("API_PORT")
	}
	if port == "" {
		port = "8000"
	}

	logger.Info("Starting API Server", "port", port, "env", os.Getenv("GO_ENV"))
	if err := router.Run(":" + port); err != nil {
		logger.Fatal("Failed to start server", "error", err)
	}
}
