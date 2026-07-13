package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimit is a small, dependency-free per-IP token-bucket limiter intended for
// abuse-prone endpoints (login/refresh). It is NOT a distributed limiter — it
// holds state in-process, which is fine for the single-node deployment topology.
//
//	rate  = tokens refilled per second
//	burst = bucket capacity (max requests in a spike)
type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64
	burst   float64
}

type bucket struct {
	tokens float64
	last   time.Time
}

// RateLimit returns middleware allowing `burst` requests immediately and then
// `perMinute` requests per minute per client IP. Over-limit requests get 429.
func RateLimit(perMinute, burst int) gin.HandlerFunc {
	rl := &rateLimiter{
		buckets: make(map[string]*bucket),
		rate:    float64(perMinute) / 60.0,
		burst:   float64(burst),
	}
	// Evict idle buckets periodically so the map can't grow unbounded.
	go rl.gc()

	return func(c *gin.Context) {
		if !rl.allow(c.ClientIP()) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{"code": "RATE_LIMITED", "message": "too many requests, please try again shortly"},
			})
			return
		}
		c.Next()
	}
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok {
		rl.buckets[key] = &bucket{tokens: rl.burst - 1, last: now}
		return true
	}
	// Refill based on elapsed time, capped at burst.
	b.tokens += now.Sub(b.last).Seconds() * rl.rate
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (rl *rateLimiter) gc() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-10 * time.Minute)
		for k, b := range rl.buckets {
			if b.last.Before(cutoff) {
				delete(rl.buckets, k)
			}
		}
		rl.mu.Unlock()
	}
}
