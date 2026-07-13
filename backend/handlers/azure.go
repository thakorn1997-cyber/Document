package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"project-document/backend/models"
)

// resolveAzureConfig reads Azure settings from app_settings (admin can edit via UI),
// falling back to env vars set in .env. Returns the effective config.
func (h *AuthHandler) resolveAzureConfig(ctx context.Context) (enabled bool, tenantID, clientID string) {
	tenantID = h.Cfg.AzureTenantID
	clientID = h.Cfg.AzureClientID

	var raw []byte
	err := h.DB.QueryRow(ctx,
		`SELECT value_json FROM app_settings WHERE key = 'login_methods'`).Scan(&raw)
	if err == nil {
		var m map[string]any
		if json.Unmarshal(raw, &m) == nil {
			if v, ok := m["azure_tenant_id"].(string); ok && strings.TrimSpace(v) != "" {
				tenantID = strings.TrimSpace(v)
			}
			if v, ok := m["azure_client_id"].(string); ok && strings.TrimSpace(v) != "" {
				clientID = strings.TrimSpace(v)
			}
			if v, ok := m["azure_enabled"].(bool); ok {
				enabled = v
			}
		}
	}
	enabled = enabled && tenantID != "" && clientID != ""
	return
}

type azureVerifier struct {
	tenantID string
	clientID string
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	initErr  error
}

var (
	azureCache   *azureVerifier
	azureCacheMu sync.Mutex
)

func (h *AuthHandler) getAzureVerifier(ctx context.Context) (*oidc.IDTokenVerifier, error) {
	enabled, tenantID, clientID := h.resolveAzureConfig(ctx)
	if !enabled {
		return nil, fmt.Errorf("azure login disabled")
	}
	azureCacheMu.Lock()
	defer azureCacheMu.Unlock()
	if azureCache != nil && azureCache.tenantID == tenantID && azureCache.clientID == clientID {
		if azureCache.initErr != nil {
			return nil, azureCache.initErr
		}
		return azureCache.verifier, nil
	}
	issuer := fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", tenantID)
	provider, err := oidc.NewProvider(ctx, issuer)
	azureCache = &azureVerifier{tenantID: tenantID, clientID: clientID}
	if err != nil {
		azureCache.initErr = err
		return nil, err
	}
	azureCache.provider = provider
	azureCache.verifier = provider.Verifier(&oidc.Config{ClientID: clientID})
	return azureCache.verifier, nil
}

func (h *AuthHandler) AzureConfig(c *gin.Context) {
	enabled, tenantID, clientID := h.resolveAzureConfig(c.Request.Context())
	OK(c, gin.H{
		"enabled":   enabled,
		"tenant_id": tenantID,
		"client_id": clientID,
	})
}

// AuthMethods returns which login methods are available (public, no auth).
func (h *AuthHandler) AuthMethods(c *gin.Context) {
	ctx := c.Request.Context()
	localOn := resolveLocalEnabled(ctx, h.DB)
	azureOn, tenantID, clientID := h.resolveAzureConfig(ctx)
	OK(c, gin.H{
		"local_enabled": localOn,
		"azure": gin.H{
			"enabled":   azureOn,
			"tenant_id": tenantID,
			"client_id": clientID,
		},
	})
}

type azureExchangeRequest struct {
	IDToken string `json:"id_token" binding:"required"`
}

type azureClaims struct {
	Email             string `json:"email"`
	PreferredUsername string `json:"preferred_username"`
	Name              string `json:"name"`
	OID               string `json:"oid"`
	TID               string `json:"tid"`
}

func (h *AuthHandler) AzureExchange(c *gin.Context) {
	enabled, _, _ := h.resolveAzureConfig(c.Request.Context())
	if !enabled {
		Err(c, http.StatusBadRequest, "AZURE_DISABLED", "azure login is not enabled")
		return
	}
	var req azureExchangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	ctx := c.Request.Context()

	verifier, err := h.getAzureVerifier(ctx)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", "azure verifier: "+err.Error())
		return
	}
	tok, err := verifier.Verify(ctx, req.IDToken)
	if err != nil {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid azure token: "+err.Error())
		return
	}
	var claims azureClaims
	if err := tok.Claims(&claims); err != nil {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "cannot parse claims")
		return
	}
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		email = strings.ToLower(strings.TrimSpace(claims.PreferredUsername))
	}
	if email == "" {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "azure token has no email")
		return
	}

	var u models.User
	err = h.DB.QueryRow(ctx,
		`SELECT id, username, email, full_name, password_hash, is_active, created_at
		   FROM users WHERE lower(email) = $1`, email,
	).Scan(&u.ID, &u.Username, &u.Email, &u.FullName, &u.PasswordHash, &u.IsActive, &u.CreatedAt)
	if err != nil {
		if !h.Cfg.AzureAutoProvision {
			Err(c, http.StatusForbidden, "FORBIDDEN", "user not registered")
			return
		}
		u.ID = uuid.NewString()
		u.Email = email
		u.Username = email
		u.FullName = claims.Name
		if u.FullName == "" {
			u.FullName = email
		}
		u.IsActive = true
		u.CreatedAt = time.Now()
		_, err = h.DB.Exec(ctx,
			`INSERT INTO users (id, username, email, full_name, password_hash, is_active)
			 VALUES ($1, $2, $3, $4, '', TRUE)`,
			u.ID, u.Username, u.Email, u.FullName)
		if err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		// New Azure users default to Role: User (admin can promote later via Settings > Users)
		_, _ = h.DB.Exec(ctx,
			`INSERT INTO user_roles (user_id, role) VALUES ($1, 'User')
			 ON CONFLICT DO NOTHING`, u.ID)
	} else if !u.IsActive {
		Err(c, http.StatusForbidden, "FORBIDDEN", "user is inactive")
		return
	}

	pair, err := h.issueTokenPair(ctx, &u)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, pair)
}

