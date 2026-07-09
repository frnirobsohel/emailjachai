package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

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

	// --- Fix I-14: Background cleanup for unbounded public_verify_logs table ---
	// আগে: public_verify_logs টেবিলটি ডাটাবেজে আনবাউন্ডেড ভাবে বড় হতে থাকত।
	// এখন: প্রতি ২৪ ঘণ্টায় একটি ব্যাকগ্রাউন্ড রুটিন চলে এবং ৩০ দিনের পুরনো সব লগ অটো ডিলিট করে।
	go func() {
		// Wait 10 seconds before running first cleanup to let startup finish
		time.Sleep(10 * time.Second)
		for {
			thirtyDaysAgo := time.Now().AddDate(0, 0, -30)
			result := config.DB.Exec("DELETE FROM public_verify_logs WHERE created_at < ?", thirtyDaysAgo)
			if result.Error != nil {
				logger.Error("Failed to clean up public_verify_logs", "error", result.Error)
			} else if result.RowsAffected > 0 {
				logger.Info("Cleaned up old public_verify_logs", "count", result.RowsAffected)
			}
			// Repeat every 24 hours
			time.Sleep(24 * time.Hour)
		}
	}()

	// 4. Configure Gin mode based on environment
	if os.Getenv("GO_ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 5. Initialize Gin Router (gin.New() instead of gin.Default() to avoid duplicate logging)
	router := gin.New()

	// Configure trusted proxies to prevent ClientIP spoofing in production
	trustedProxiesEnv := os.Getenv("TRUSTED_PROXIES")
	if trustedProxiesEnv != "" {
		proxies := strings.Split(trustedProxiesEnv, ",")
		for i := range proxies {
			proxies[i] = strings.TrimSpace(proxies[i])
		}
		if err := router.SetTrustedProxies(proxies); err != nil {
			logger.Error("Failed to set trusted proxies", "error", err)
		}
	} else {
		// Secure by default: do not trust any proxy header unless configured
		if err := router.SetTrustedProxies(nil); err != nil {
			logger.Error("Failed to disable trusted proxies", "error", err)
		}
	}

	// Configure trusted platform (e.g. Cloudflare CF-Connecting-IP)
	trustedPlatform := os.Getenv("TRUSTED_PLATFORM")
	if trustedPlatform != "" {
		if strings.ToLower(trustedPlatform) == "cloudflare" {
			router.TrustedPlatform = gin.PlatformCloudflare
		} else {
			router.TrustedPlatform = trustedPlatform
		}
	}

	router.Use(middleware.Logger()) // Custom Zap logger middleware
	router.Use(gin.Recovery()) // Panic recovery middleware

	// 6. Setup Routes
	routes.SetupRoutes(router)

	// 7. Start API Server with Graceful Shutdown
	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("API_PORT")
	}
	if port == "" {
		port = "8000"
	}

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	// Initializing the server in a goroutine so that it won't block the graceful shutdown handling below
	go func() {
		logger.Info("Starting API Server", "port", port, "env", os.Getenv("GO_ENV"))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("Failed to start server", "error", err)
		}
	}()

	// Listen for interrupt signals (SIGINT, SIGTERM) to gracefully shut down the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Shutting down server gracefully...")

	// The context is used to inform the server it has 10 seconds to finish the request it is currently handling
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown:", "error", err)
	}

	logger.Info("Server exiting")
}
