package db

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPool(ctx context.Context, dsn string) *pgxpool.Pool {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		log.Fatalf("parse database url: %v", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping database: %v", err)
	}

	log.Println("database connected")
	return pool
}
