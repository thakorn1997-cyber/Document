package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type Meta struct {
	Page  int   `json:"page,omitempty"`
	Size  int   `json:"size,omitempty"`
	Total int64 `json:"total,omitempty"`
	// ServerDate = "today" on the server (local zone, YYYY-MM-DD). Clients must
	// use this — not their own clock — for aging/day-count math so a skewed
	// client clock can't change what the report shows.
	ServerDate string `json:"server_date,omitempty"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

func List(c *gin.Context, data any, meta Meta) {
	meta.ServerDate = time.Now().Format("2006-01-02")
	c.JSON(http.StatusOK, gin.H{"data": data, "meta": meta})
}

func Err(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, gin.H{
		"error": gin.H{"code": code, "message": message},
	})
}
