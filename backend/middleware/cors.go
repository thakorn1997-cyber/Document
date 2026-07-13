package middleware

import (
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Match private IPv4 (10.x, 172.16-31.x, 192.168.x) and localhost hosts.
// Used to accept LAN origins in dev without hard-coding IPs.
var privateHostRe = regexp.MustCompile(
	`^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\])$`,
)

// CORS builds the CORS middleware:
//   - explicit allowlist from env (comma-separated) — always honored
//   - PLUS, when allowPrivateLAN is true (dev only), any origin whose host is localhost
//     or private LAN (10.*, 192.168.*, 172.16-31.*) so devs can hit the app via machine
//     IP without editing env.
//
// In production pass allowPrivateLAN=false so ONLY the explicit CORS_ALLOWED_ORIGINS are
// accepted — the LAN wildcard + AllowCredentials would otherwise let any private-network
// origin make credentialed requests.
func CORS(allowedOrigins []string, allowPrivateLAN bool) gin.HandlerFunc {
	allowSet := map[string]struct{}{}
	for _, o := range allowedOrigins {
		allowSet[strings.TrimRight(o, "/")] = struct{}{}
	}

	return cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if _, ok := allowSet[strings.TrimRight(origin, "/")]; ok {
				return true
			}
			if !allowPrivateLAN {
				return false
			}
			u, err := url.Parse(origin)
			if err != nil {
				return false
			}
			host := u.Hostname()
			return privateHostRe.MatchString(host)
		},
		AllowMethods:     []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept"},
		ExposeHeaders:    []string{"Content-Disposition"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
