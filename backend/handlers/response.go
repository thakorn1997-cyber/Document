package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Meta struct {
	Page  int   `json:"page,omitempty"`
	Size  int   `json:"size,omitempty"`
	Total int64 `json:"total,omitempty"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, gin.H{"data": data})
}

func List(c *gin.Context, data any, meta Meta) {
	c.JSON(http.StatusOK, gin.H{"data": data, "meta": meta})
}

func Err(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, gin.H{
		"error": gin.H{"code": code, "message": message},
	})
}
