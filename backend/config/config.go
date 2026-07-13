package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv  string
	AppPort string

	DatabaseURL string

	JWTAccessSecret  string
	JWTRefreshSecret string
	JWTAccessTTL     time.Duration
	JWTRefreshTTL    time.Duration

	StorageDriver    string
	StorageLocalPath string
	MaxUploadMB      int64

	CORSAllowedOrigins []string
	TrustedProxies     []string

	AzureTenantID     string
	AzureClientID     string
	AzureAutoProvision bool
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		AppEnv:  getEnv("APP_ENV", "development"),
		AppPort: getEnv("APP_PORT", "8080"),

		DatabaseURL: mustEnv("DATABASE_URL"),

		JWTAccessSecret:  mustEnv("JWT_ACCESS_SECRET"),
		JWTRefreshSecret: mustEnv("JWT_REFRESH_SECRET"),
		JWTAccessTTL:     parseDuration("JWT_ACCESS_TTL", 15*time.Minute),
		JWTRefreshTTL:    parseDuration("JWT_REFRESH_TTL", 168*time.Hour),

		StorageDriver:    getEnv("STORAGE_DRIVER", "local"),
		StorageLocalPath: getEnv("STORAGE_LOCAL_PATH", "./storage/documents"),
		MaxUploadMB:      parseInt("MAX_UPLOAD_MB", 20),

		CORSAllowedOrigins: splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")),
		TrustedProxies:     splitCSV(getEnv("TRUSTED_PROXIES", "")),

		AzureTenantID:      getEnv("AZURE_TENANT_ID", ""),
		AzureClientID:      getEnv("AZURE_CLIENT_ID", ""),
		AzureAutoProvision: getEnv("AZURE_AUTO_PROVISION", "true") == "true",
	}
}

func (c *Config) AzureEnabled() bool {
	return c.AzureTenantID != "" && c.AzureClientID != ""
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required env %s is not set", key)
	}
	return v
}

func parseDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func parseInt(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i
		}
	}
	return fallback
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
