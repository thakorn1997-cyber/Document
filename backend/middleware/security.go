package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders sets conservative security response headers on every request.
// HSTS is intentionally left to the TLS-terminating reverse proxy (the app may
// run behind plain HTTP internally); everything here is safe same-origin.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Next()
	}
}
