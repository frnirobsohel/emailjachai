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
	"ejp-backend/internal/repo"
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

	// Activity logs retention: operational 90d, Auth Login Failed 7d (throttle needs 15m)
	go func() {
		time.Sleep(15 * time.Second)
		logRepo := repo.NewLogRepo()
		for {
			n, err := logRepo.PurgeExpired(90, 7)
			if err != nil {
				logger.Error("Failed to purge expired activity_logs", "error", err)
			} else if n > 0 {
				logger.Info("Purged expired activity_logs", "count", n)
			}
			time.Sleep(24 * time.Hour)
		}
	}()

	// 4. Configure Gin mode based on environment
	if os.Getenv("GO_ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 5. Initialize Gin Router (gin.New() instead of gin.Default() to avoid duplicate logging)
	router := gin.New()

	// Configure trusted proxies so Gin ClientIP() honors X-Forwarded-For / X-Real-IP.
	// Dokploy/Docker: traffic is Frontend container → Backend, so RemoteAddr is always
	// the same private hop unless we trust internal CIDRs (or an explicit allowlist).
	trustedProxiesEnv := os.Getenv("TRUSTED_PROXIES")
	if trustedProxiesEnv != "" {
		proxies := strings.Split(trustedProxiesEnv, ",")
		for i := range proxies {
			proxies[i] = strings.TrimSpace(proxies[i])
		}
		if err := router.SetTrustedProxies(proxies); err != nil {
			logger.Error("Failed to set trusted proxies", "error", err)
		} else {
			logger.Info("Trusted proxies configured from TRUSTED_PROXIES", "count", len(proxies))
		}
	} else {
		// Default: trust loopback + RFC1918 private networks (Docker / Dokploy / Traefik).
		// Keep the API private behind the proxy; do not expose it publicly with this default.
		defaultProxies := []string{
			"127.0.0.1",
			"::1",
			"10.0.0.0/8",
			"172.16.0.0/12",
			"192.168.0.0/16",
		}
		if err := router.SetTrustedProxies(defaultProxies); err != nil {
			logger.Error("Failed to set default trusted proxies", "error", err)
		} else {
			logger.Info("Trusted proxies defaulted to private networks for ClientIP")
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
		logger.Info("Trusted platform enabled", "platform", router.TrustedPlatform)
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
