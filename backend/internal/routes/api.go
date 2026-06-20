package routes

import (
	"net/http"

	"ejp-backend/internal/api/handler"
	"ejp-backend/internal/api/middleware"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(router *gin.Engine) {
	// CORS Middleware
	router.Use(middleware.CORSMiddleware())

	// Initialize Repositories
	userRepo := repo.NewUserRepo()
	apiKeyRepo := repo.NewAPIKeyRepo()
	jobRepo := repo.NewJobRepository()
	jobResultRepo := repo.NewJobResultRepo()
	logRepo := repo.NewLogRepo()
	domainRepo := repo.NewDomainRepo()
	serverRepo := repo.NewServerRepo()
	packageRepo := repo.NewPackageRepo()
	settingsRepo := repo.NewSettingsRepo()
	txRepo := repo.NewTransactionRepo()
	cacheRepo := repo.NewCacheRepository(config.DB)
	adminRepo := repo.NewAdminRepo()
	systemRepo := repo.NewSystemRepo()
	workerRepo := repo.NewWorkerRepo()

	// Initialize Services
	emailService := service.NewEmailService(systemRepo)
	apiKeyService := service.NewAPIKeyService(apiKeyRepo)
	authService := service.NewAuthService(userRepo, apiKeyService, logRepo, emailService, systemRepo, settingsRepo)
	userService := service.NewUserService(userRepo)
	jobService := service.NewJobService(jobRepo, jobResultRepo, userRepo, txRepo, settingsRepo, cacheRepo)
	logService := service.NewLogService(logRepo)
	domainService := service.NewDomainService(domainRepo, logRepo)
	serverService := service.NewServerService(serverRepo)
	packageService := service.NewPackageService(packageRepo)
	settingsService := service.NewSettingsService(settingsRepo, logRepo)
	paymentService := service.NewPaymentService(txRepo, packageRepo, userRepo, emailService, settingsRepo)
	workerService := service.NewWorkerService(workerRepo, jobRepo, serverRepo, settingsRepo)
	adminService := service.NewAdminService(adminRepo, userRepo, jobRepo, logRepo, txRepo, emailService)
	systemService := service.NewSystemService(systemRepo)
	resellerService := service.NewResellerService(userRepo, txRepo)

	// Initialize Handlers
	authHandler := handler.NewAuthHandler(authService, userService)
	jobHandler := handler.NewJobHandler(jobService)
	publicVerifyHandler := handler.NewPublicVerifyHandler()
	userHandler := handler.NewUserHandler(userService, jobService, paymentService, resellerService)
	apiKeyHandler := handler.NewAPIKeyHandler(apiKeyService)
	paymentHandler := handler.NewPaymentHandler(paymentService)
	workerHandler := handler.NewWorkerHandler(workerService, cacheRepo)
	systemHandler := handler.NewSystemHandler()
	adminHandler := handler.NewAdminHandler(adminService, logService, domainService, serverService, packageService, settingsService, systemService)
	cacheHandler := handler.NewCacheHandler(cacheRepo, settingsRepo)

	// Start Global Background Broadcasters
	adminHandler.StartAdminStatsBroadcaster()
	adminHandler.StartServerListBroadcaster()

	// Global API v1 Group
	v1 := router.Group("/api/v1")
	v1.Use(middleware.RateLimiter())
	{
		// ==========================================
		// 1. PUBLIC / GENERAL ROUTES
		// ==========================================
		v1.GET("/", systemHandler.Ping)
		v1.GET("/health", systemHandler.HealthCheck)
		v1.GET("/ping", systemHandler.Ping)
		v1.GET("/settings/public", adminHandler.GetPublicSettings)
		v1.GET("/packages/list", adminHandler.GetActivePackages)
		// Public email verify (no auth, no credits, strict IP rate limit)
		v1.POST("/jobs/verify-public", middleware.PublicRateLimiter(), publicVerifyHandler.VerifyPublic)
		v1.GET("/jobs/verify-public/status", publicVerifyHandler.GetPublicStatus)
		// WebSocket Route
		v1.GET("/ws", middleware.WSAuthMiddleware(), systemHandler.ServeWS)

		// Public Auth
		authRoutes := v1.Group("/auth")
		authRoutes.Use(middleware.PublicRateLimiter())
		{
			authRoutes.POST("/login", authHandler.Login)
			authRoutes.POST("/register", authHandler.Register)
			authRoutes.POST("/forgot-password", authHandler.ForgotPassword)
			authRoutes.POST("/reset-password", authHandler.ResetPassword)
		}
		v1.GET("/auth/verify-email", authHandler.VerifyEmail)

		// ==========================================
		// 2. WORKER SPECIFIC API
		// ==========================================
		worker := v1.Group("/worker")
		worker.Use(handler.WorkerAuthMiddleware())
		{
			worker.POST("/claim-task", workerHandler.ClaimTask)
			worker.POST("/complete-task", workerHandler.CompleteTask)
			worker.GET("/domains", workerHandler.GetWorkerDomains)
			worker.POST("/reset-tasks", workerHandler.ResetWorkerTasks)
		}

		// Job Results Reporting (Worker Access)
		jobsWorker := v1.Group("/jobs")
		jobsWorker.Use(handler.WorkerAuthMiddleware())
		{
			jobsWorker.POST("/push-result", workerHandler.ReportTaskResult)
			jobsWorker.POST("/push-results", workerHandler.ReportTaskResults)
		}

		// Internal compatibility routes (Legacy)
		internalWorker := v1.Group("/internal")
		internalWorker.Use(handler.WorkerAuthMiddleware())
		{
			internalWorker.POST("/report-task", workerHandler.ReportTaskResult)
			internalWorker.POST("/report-tasks", workerHandler.ReportTaskResults)
			internalWorker.GET("/domains", workerHandler.GetWorkerDomains)
			internalWorker.POST("/reset-tasks", workerHandler.ResetWorkerTasks)
			internalWorker.POST("/heartbeat", handler.WorkerHeartbeat)
		}

		// ==========================================
		// 3. PAYMENT WEBHOOKS
		// ==========================================
		paymentWebhooks := v1.Group("/payment")
		{
			paymentWebhooks.POST("/:provider/webhook", paymentHandler.HandleWebhook)
		}

		// ==========================================
		// 4. AUTHENTICATED USER ROUTES
		// ==========================================
		protected := v1.Group("")
		protected.Use(middleware.AuthMiddleware())
		{
			// Jobs & Verification
			protected.POST("/jobs/submit", jobHandler.SubmitBulkJob)
			protected.POST("/jobs/submit-file", jobHandler.SubmitBulkJob)
			protected.POST("/jobs/verify-single", jobHandler.SubmitSingleVerify)
			protected.GET("/jobs/download", jobHandler.DownloadJobResults)
			protected.GET("/jobs/list", jobHandler.GetJobs)
			protected.GET("/jobs/status", jobHandler.GetJobStatus)
			protected.POST("/jobs/delete", jobHandler.DeleteJob)

			// User API Keys
			userKeys := protected.Group("/user/keys")
			{
				userKeys.GET("", apiKeyHandler.GetAPIKeys)
				userKeys.GET("/list", apiKeyHandler.GetAPIKeys)
				userKeys.POST("/create", apiKeyHandler.CreateAPIKey)
				userKeys.POST("/revoke", apiKeyHandler.DeleteAPIKey)
				userKeys.POST("/rotate", apiKeyHandler.RotateAPIKey)
			}

			// Dashboard & Auth
			protected.GET("/dashboard/stats", handler.DashboardStats)
			protected.GET("/dashboard/history", userHandler.DashboardHistory)
			protected.GET("/user/transactions", userHandler.DashboardHistory) // Alias for frontend
			protected.GET("/auth/me", authHandler.GetMe)
			protected.POST("/auth/profile/update", authHandler.UpdateProfile)

			// Webhook Settings
			protected.GET("/user/webhook", userHandler.GetWebhookSettings)
			protected.POST("/user/webhook", userHandler.UpdateWebhookSettings)

			// Payment Session Creation
			payments := protected.Group("/payments")
			{
				payments.POST("/create", paymentHandler.CreateSession)
				payments.POST("/stripe/create", paymentHandler.CreateSession)
				payments.POST("/paypal/create", paymentHandler.CreateSession)
				payments.POST("/cryptomus/create", paymentHandler.CreateSession)
				payments.GET("/verify", paymentHandler.VerifyPayment)
			}
			// Legacy singular aliases
			protected.POST("/payment/create", paymentHandler.CreateSession)

			// Reseller
			protected.POST("/reseller/transfer", userHandler.TransferCredits)
		}

		// ==========================================
		// 5. ADMIN ROUTES
		// ==========================================
		admin := v1.Group("/admin")
		admin.Use(middleware.AuthMiddleware())
		admin.Use(middleware.AdminMiddleware())
		{
			admin.GET("/users", adminHandler.GetAllUsers)
			admin.POST("/users/action", adminHandler.UserAction)
			admin.POST("/users/create", adminHandler.CreateUser)
			admin.POST("/users/edit", adminHandler.EditUser)
			admin.POST("/users/:id/credits", adminHandler.UpdateUserCredits)
			admin.POST("/impersonate", authHandler.Impersonate)
			
			admin.GET("/settings", adminHandler.GetSettings)
			admin.POST("/settings/update", adminHandler.UpdateSettings)

			admin.GET("/packages", adminHandler.ListPackages)
			admin.POST("/packages/create", adminHandler.CreatePackage)
			admin.POST("/packages/update", adminHandler.UpdatePackage)
			admin.POST("/packages/delete", adminHandler.DeletePackage)

			admin.GET("/jobs/stats", adminHandler.AdminJobStats)
			admin.POST("/jobs/cleanup", adminHandler.AdminJobCleanup)
			admin.GET("/jobs/download-all", adminHandler.AdminDownloadAllJobs)

			admin.GET("/domains", adminHandler.GetAllDomains)
			admin.POST("/domains/store", adminHandler.AddDomain)
			admin.POST("/domains/toggle", adminHandler.ToggleDomain)
			admin.POST("/domains/delete", adminHandler.DeleteDomain)
			admin.POST("/domains/upload", adminHandler.UploadDomains)

			admin.GET("/dashboard/stats", adminHandler.AdminStats)
			admin.GET("/logs/list", adminHandler.GetLogs)
			admin.DELETE("/logs/clear", adminHandler.ClearLogs)

			// Cache Control
			admin.GET("/cache/stats", cacheHandler.GetStats)
			admin.POST("/cache/policies", cacheHandler.UpdatePolicies)
			admin.POST("/cache/lookup", cacheHandler.LookupEmail)
			admin.DELETE("/cache/lookup", cacheHandler.DeleteEmail)
			admin.POST("/cache/purge", cacheHandler.PurgeExpiredCache)
			admin.POST("/cache/upload", cacheHandler.UploadBulkCache)

			// Server Management
			admin.GET("/server/list", adminHandler.ListServers)
			admin.GET("/server/worker-key", adminHandler.GetWorkerKey)
			admin.POST("/server/add", adminHandler.AddServer)
			admin.POST("/server/update", adminHandler.UpdateServer)
			admin.POST("/server/toggle", adminHandler.ToggleServer)
			admin.POST("/server/delete", adminHandler.DeleteServer)
			admin.POST("/server/worker-key/rotate", adminHandler.RotateWorkerKey)

			// System Management
			admin.GET("/system/status", adminHandler.GetSystemStatus)
			admin.POST("/system/license", adminHandler.SaveLicenseKey)
			admin.POST("/system/update", adminHandler.UploadUpdate)
			admin.GET("/system/backups", adminHandler.ListBackups)
			admin.POST("/system/backups", adminHandler.CreateBackup)
			admin.DELETE("/system/backups", adminHandler.DeleteBackup)

			// SMTP Settings
			admin.GET("/smtp/settings", adminHandler.GetSmtpSettings)
			admin.POST("/smtp/settings", adminHandler.SaveSmtpSettings)
			admin.GET("/smtp/templates", adminHandler.GetTemplates)
			admin.POST("/smtp/templates", adminHandler.SaveTemplate)
			admin.POST("/smtp/test", adminHandler.TestSmtpConnection)

			// Security Shield & Public Verifier
			admin.GET("/security/dashboard", adminHandler.SecurityDashboard)
			admin.GET("/security/verify-logs", adminHandler.GetSecurityVerifyLogs)
			admin.GET("/security/blocklist", adminHandler.GetSecurityBlocklist)
			admin.POST("/security/unblock", adminHandler.SecurityUnblock)
			admin.POST("/security/settings", adminHandler.UpdateSecuritySettings)
			admin.POST("/packages/toggle-public", adminHandler.TogglePackagePublic)
		}
	}

	// Root Level Fallbacks (Legacy/Health)
	router.GET("/health", handler.HealthCheck)

	// 404 Handler for undefined routes
	router.NoRoute(func(c *gin.Context) {
		helper.SendError(c, http.StatusNotFound, "Route not found", "ERR_NOT_FOUND")
	})
}



