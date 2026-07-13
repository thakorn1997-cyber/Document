package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"project-document/backend/config"
	"project-document/backend/db"
	"project-document/backend/handlers"
	"project-document/backend/middleware"
	"project-document/backend/notify"
	"project-document/backend/storage"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool := db.NewPool(ctx, cfg.DatabaseURL)
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	store, err := storage.New(cfg.StorageDriver, cfg.StorageLocalPath)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}
	hub := notify.NewHub()

	isProd := cfg.AppEnv == "production"
	if isProd {
		gin.SetMode(gin.ReleaseMode)
		if len(cfg.CORSAllowedOrigins) == 0 {
			log.Println("warning: APP_ENV=production but CORS_ALLOWED_ORIGINS is empty — cross-origin browser calls will be blocked (fine if the frontend proxies same-origin)")
		}
	}
	r := gin.Default()
	r.Use(middleware.SecurityHeaders())
	// Allow the private-LAN origin wildcard in dev only; production trusts the explicit allowlist.
	r.Use(middleware.CORS(cfg.CORSAllowedOrigins, !isProd))
	r.MaxMultipartMemory = cfg.MaxUploadMB * 1024 * 1024

	authH := handlers.NewAuthHandler(cfg, pool)
	docH := handlers.NewDocumentHandler(cfg, pool, store, hub)
	notifH := handlers.NewNotifHandler(cfg, pool, hub)

	r.GET("/healthz", handlers.Health(pool))

	// Static serving for avatars (public within the org's network — no auth required for images)
	r.Static("/uploads/avatars", "./storage/avatars")

	// SSE stream — auth via query param (EventSource can't send headers)
	r.GET("/api/v1/notifications/stream", notifH.Stream)

	api := r.Group("/api/v1")
	{
		auth := api.Group("/auth")
		// Throttle abuse-prone credential endpoints per IP (brute-force guard).
		authLimit := middleware.RateLimit(30, 10)
		auth.POST("/login", authLimit, authH.Login)
		auth.POST("/refresh", authLimit, authH.Refresh)
		auth.POST("/azure/exchange", authLimit, authH.AzureExchange)
		auth.GET("/azure/config", authH.AzureConfig)
		auth.GET("/methods", authH.AuthMethods)

		protected := api.Group("")
		protected.Use(middleware.JWTAuth(cfg.JWTAccessSecret))
		protected.Use(middleware.LoadUserContext(pool))
		{
			protected.POST("/auth/logout", authH.Logout)
			protected.GET("/auth/me", authH.Me)

			protected.POST("/documents", docH.Create)
			protected.GET("/documents", docH.List)
			protected.GET("/documents/:id", docH.Detail)
			protected.PATCH("/documents/:id", docH.Update)
			protected.DELETE("/documents/:id", docH.Delete)
			protected.POST("/documents/:id/versions", docH.AddVersions)
			protected.GET("/documents/:id/versions/:versionId/download", docH.Download)
			protected.DELETE("/documents/:id/versions/:versionId", docH.DeleteVersion)
			protected.POST("/documents/:id/acknowledge", docH.Acknowledge)
			protected.DELETE("/documents/:id/acknowledge", docH.Unacknowledge)

			masterH := handlers.NewMasterHandler(pool)
			protected.GET("/departments", masterH.ListDepartments)
			protected.GET("/document-types", masterH.ListDocumentTypes)
			protected.GET("/users", masterH.ListUsers)

			settingsH := handlers.NewSettingsHandler(pool)
			protected.GET("/settings", settingsH.Get)
			protected.PATCH("/settings", settingsH.Patch)

			userAdminH := handlers.NewUserAdminHandler(pool)
			protected.GET("/admin/users", userAdminH.List)
			protected.PATCH("/admin/users/:id", userAdminH.Patch)
			protected.DELETE("/admin/users/:id", userAdminH.Delete)

			avatarH := handlers.NewAvatarHandler(pool)
			protected.POST("/users/:id/avatar", avatarH.Upload)
			protected.DELETE("/users/:id/avatar", avatarH.Delete)

			staffH := handlers.NewStaffHandler(pool)
			protected.GET("/staff", staffH.List)
			protected.GET("/admin/staff", staffH.ListAll)
			protected.POST("/admin/staff", staffH.Create)
			protected.PATCH("/admin/staff/:id", staffH.Update)
			protected.DELETE("/admin/staff/:id", staffH.Delete)

			companyH := handlers.NewCompanyHandler(pool)
			protected.GET("/companies", companyH.List)
			protected.GET("/admin/companies", companyH.ListAll)
			protected.POST("/admin/companies", companyH.Create)
			protected.PATCH("/admin/companies/:id", companyH.Update)
			protected.DELETE("/admin/companies/:id", companyH.Delete)

			protected.GET("/notifications", notifH.List)
			protected.GET("/notifications/unread-count", notifH.UnreadCount)
			protected.POST("/notifications/:id/read", notifH.MarkRead)
			protected.POST("/notifications/read-all", notifH.MarkAllRead)

			dashboardH := handlers.NewDashboardHandler(pool)
			protected.GET("/dashboard", dashboardH.Get)
			protected.GET("/dashboard/daily", dashboardH.Daily)

			masterAdminH := handlers.NewMasterAdminHandler(pool)
			protected.GET("/positions", masterAdminH.ListPositions)
			protected.GET("/admin/departments", masterAdminH.ListDepartmentsAll)
			protected.POST("/admin/departments", masterAdminH.CreateDepartment)
			protected.PATCH("/admin/departments/:id", masterAdminH.UpdateDepartment)
			protected.DELETE("/admin/departments/:id", masterAdminH.DeleteDepartment)
			protected.GET("/admin/positions", masterAdminH.ListPositionsAll)
			protected.POST("/admin/positions", masterAdminH.CreatePosition)
			protected.PATCH("/admin/positions/:id", masterAdminH.UpdatePosition)
			protected.DELETE("/admin/positions/:id", masterAdminH.DeletePosition)
		}
	}

	srv := startServer(r, ":"+cfg.AppPort)
	log.Printf("server listening on :%s", cfg.AppPort)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
