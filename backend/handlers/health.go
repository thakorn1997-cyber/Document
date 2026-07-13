package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Health(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := db.Ping(c.Request.Context()); err != nil {
			Err(c, 503, "UNAVAILABLE", err.Error())
			return
		}
		OK(c, gin.H{"status": "ok"})
	}
}
