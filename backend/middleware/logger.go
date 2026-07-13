package middleware

import (
	"fmt"
	"regexp"

	"github.com/gin-gonic/gin"
)

// Credentials passed via query string (SSE's ?access_token=...) must never
// reach the access log — a leaked log line is a leaked session.
var tokenParamRe = regexp.MustCompile(`(access_token|refresh_token|token)=[^&\s]+`)

// RedactedLogger mirrors gin's default log line but scrubs token query
// parameters before the path is written out.
func RedactedLogger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(p gin.LogFormatterParams) string {
		path := tokenParamRe.ReplaceAllString(p.Path, "$1=[REDACTED]")
		return fmt.Sprintf("[GIN] %s | %3d | %13v | %15s | %-7s %q\n",
			p.TimeStamp.Format("2006/01/02 - 15:04:05"),
			p.StatusCode, p.Latency, p.ClientIP, p.Method, path)
	})
}
