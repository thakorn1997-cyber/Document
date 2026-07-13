package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/config"
	"project-document/backend/models"
	"project-document/backend/utils"
)

type AuthHandler struct {
	Cfg *config.Config
	DB  *pgxpool.Pool
}

func NewAuthHandler(cfg *config.Config, db *pgxpool.Pool) *AuthHandler {
	return &AuthHandler{Cfg: cfg, DB: db}
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type tokenPair struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	User         *models.User `json:"user"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	ctx := c.Request.Context()

	if !resolveLocalEnabled(ctx, h.DB) {
		Err(c, http.StatusForbidden, "LOCAL_LOGIN_DISABLED",
			"การเข้าสู่ระบบด้วย Username/Password ถูกปิดใช้งานโดย admin")
		return
	}

	var u models.User
	err := h.DB.QueryRow(ctx,
		`SELECT id, username, email, full_name, password_hash, is_active, created_at
		   FROM users WHERE username = $1 AND is_active = true`, req.Username,
	).Scan(&u.ID, &u.Username, &u.Email, &u.FullName, &u.PasswordHash, &u.IsActive, &u.CreatedAt)
	if err != nil {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid credentials")
		return
	}
	if !utils.VerifyPassword(u.PasswordHash, req.Password) {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid credentials")
		return
	}

	pair, err := h.issueTokenPair(ctx, &u)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, pair)
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	claims, err := utils.ParseToken(req.RefreshToken, h.Cfg.JWTRefreshSecret)
	if err != nil || claims.Type != utils.RefreshToken {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid refresh token")
		return
	}
	ctx := c.Request.Context()

	tokenHash := hashToken(req.RefreshToken)
	var revokedAt *time.Time
	err = h.DB.QueryRow(ctx,
		`SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()`,
		tokenHash, claims.UserID,
	).Scan(&revokedAt)
	if err != nil || revokedAt != nil {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "refresh token not active")
		return
	}

	access, _, err := utils.IssueToken(claims.UserID, utils.AccessToken, h.Cfg.JWTAccessSecret, h.Cfg.JWTAccessTTL)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"access_token": access})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	tokenHash := hashToken(req.RefreshToken)
	_, _ = h.DB.Exec(c.Request.Context(),
		`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, tokenHash)
	OK(c, gin.H{"ok": true})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	ctx := c.Request.Context()

	var u models.User
	var posCode, posName *string
	var posActive *bool
	err := h.DB.QueryRow(ctx, `
		SELECT u.id, u.username, u.email, u.full_name, u.employee_id, u.avatar_path,
		       u.position_id, p.code, p.name, p.is_active,
		       u.is_active, u.created_at
		  FROM users u
		  LEFT JOIN positions p ON p.id = u.position_id
		 WHERE u.id = $1`, userID,
	).Scan(&u.ID, &u.Username, &u.Email, &u.FullName, &u.EmployeeID, &u.AvatarPath,
		&u.PositionID, &posCode, &posName, &posActive,
		&u.IsActive, &u.CreatedAt)
	if err != nil {
		Err(c, http.StatusNotFound, "NOT_FOUND", "user not found")
		return
	}

	if u.PositionID != nil && posCode != nil {
		u.Position = &models.Position{
			ID: *u.PositionID, Code: *posCode, Name: *posName,
			IsActive: posActive != nil && *posActive,
		}
	}

	rows, err := h.DB.Query(ctx, `SELECT role FROM user_roles WHERE user_id = $1`, u.ID)
	if err == nil {
		for rows.Next() {
			var r models.Role
			if err := rows.Scan(&r); err == nil {
				u.Roles = append(u.Roles, r)
			}
		}
		rows.Close()
	}

	rows, err = h.DB.Query(ctx,
		`SELECT d.id, d.code, d.name_th, d.name_en, d.is_active
		   FROM departments d
		   JOIN user_departments ud ON ud.department_id = d.id
		  WHERE ud.user_id = $1 AND d.is_active = true`, u.ID)
	if err == nil {
		for rows.Next() {
			var d models.Department
			if err := rows.Scan(&d.ID, &d.Code, &d.NameTH, &d.NameEN, &d.IsActive); err == nil {
				u.Departments = append(u.Departments, d)
			}
		}
		rows.Close()
	}

	OK(c, u)
}

func (h *AuthHandler) issueTokenPair(ctx context.Context, u *models.User) (*tokenPair, error) {
	access, _, err := utils.IssueToken(u.ID, utils.AccessToken, h.Cfg.JWTAccessSecret, h.Cfg.JWTAccessTTL)
	if err != nil {
		return nil, err
	}
	refresh, jti, err := utils.IssueToken(u.ID, utils.RefreshToken, h.Cfg.JWTRefreshSecret, h.Cfg.JWTRefreshTTL)
	if err != nil {
		return nil, err
	}
	_, err = h.DB.Exec(ctx,
		`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
		jti, u.ID, hashToken(refresh), time.Now().Add(h.Cfg.JWTRefreshTTL))
	if err != nil {
		return nil, err
	}
	return &tokenPair{AccessToken: access, RefreshToken: refresh, User: u}, nil
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}
