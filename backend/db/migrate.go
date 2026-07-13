package db

import (
	"context"
	"embed"
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		name := e.Name()
		if strings.HasSuffix(name, ".up.sql") {
			files = append(files, name)
		}
	}
	sort.Strings(files)

	for _, f := range files {
		version := strings.TrimSuffix(f, ".up.sql")
		var exists bool
		err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`, version,
		).Scan(&exists)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		sql, err := migrationFS.ReadFile("migrations/" + f)
		if err != nil {
			return err
		}
		log.Printf("applying migration %s", f)
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("apply %s: %w", f, err)
		}
		if _, err := pool.Exec(ctx,
			`INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
			return err
		}
	}
	log.Println("migrations up to date")
	return nil
}
