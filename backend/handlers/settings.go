package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/middleware"
)

type SettingsHandler struct {
	DB *pgxpool.Pool
}

func NewSettingsHandler(db *pgxpool.Pool) *SettingsHandler {
	return &SettingsHandler{DB: db}
}

func (h *SettingsHandler) Get(c *gin.Context) {
	ctx := c.Request.Context()
	rows, err := h.DB.Query(ctx, `SELECT key, value_json FROM app_settings`)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()
	out := map[string]any{}
	for rows.Next() {
		var k string
		var raw []byte
		if err := rows.Scan(&k, &raw); err != nil {
			continue
		}
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			v = nil
		}
		out[k] = v
	}
	OK(c, out)
}

type patchRequest map[string]any

func (h *SettingsHandler) Patch(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	var req patchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}

	// Lockout guard: if login_methods is being changed, ensure at least one method stays enabled
	if lm, ok := req["login_methods"].(map[string]any); ok {
		localOn := true
		if v, ok := lm["local_enabled"].(bool); ok {
			localOn = v
		}
		azureOn := false
		if v, ok := lm["azure_enabled"].(bool); ok {
			azureOn = v
		}
		tenant, _ := lm["azure_tenant_id"].(string)
		client, _ := lm["azure_client_id"].(string)
		azureUsable := azureOn && strings.TrimSpace(tenant) != "" && strings.TrimSpace(client) != ""
		if !localOn && !azureUsable {
			Err(c, http.StatusUnprocessableEntity, "LOCKOUT_GUARD",
				"ต้องเปิดใช้งานอย่างน้อย 1 วิธีการเข้าสู่ระบบ")
			return
		}
	}
	userID := c.GetString(middleware.CtxUserID)
	ctx := c.Request.Context()
	for k, v := range req {
		raw, err := json.Marshal(v)
		if err != nil {
			Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
			return
		}
		_, err = h.DB.Exec(ctx, `
			INSERT INTO app_settings (key, value_json, updated_by, updated_at)
			VALUES ($1, $2, $3, NOW())
			ON CONFLICT (key) DO UPDATE
			  SET value_json = EXCLUDED.value_json,
			      updated_by = EXCLUDED.updated_by,
			      updated_at = NOW()`,
			k, raw, userID)
		if err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
	}
	h.Get(c)
}

func isAdmin(c *gin.Context) bool {
	for _, r := range middleware.UserRoles(c) {
		if r == "SystemAdmin" || r == "admin" {
			return true
		}
	}
	return false
}
