package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func startServer(r *gin.Engine, addr string) *http.Server {
	srv := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			panic(err)
		}
	}()
	return srv
}
