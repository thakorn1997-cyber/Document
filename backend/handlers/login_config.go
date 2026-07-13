package handlers

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

// LoginMethods represents the effective login availability.
type LoginMethods struct {
	LocalEnabled bool
	AzureEnabled bool // includes tenant/client presence check
	AzureTenant  string
	AzureClient  string
}

// resolveLocalEnabled reads the local_enabled flag; defaults to true when missing.
func resolveLocalEnabled(ctx context.Context, db *pgxpool.Pool) bool {
	var raw []byte
	err := db.QueryRow(ctx,
		`SELECT value_json FROM app_settings WHERE key = 'login_methods'`).Scan(&raw)
	if err != nil {
		return true
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return true
	}
	if v, ok := m["local_enabled"].(bool); ok {
		return v
	}
	return true // default on
}
