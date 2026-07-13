package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/middleware"
)

const AvatarDir = "./storage/avatars"

type AvatarHandler struct {
	DB *pgxpool.Pool
}

func NewAvatarHandler(db *pgxpool.Pool) *AvatarHandler {
	_ = os.MkdirAll(AvatarDir, 0o755)
	return &AvatarHandler{DB: db}
}

// Upload: POST /users/:id/avatar (self or admin)
func (h *AvatarHandler) Upload(c *gin.Context) {
	targetID := c.Param("id")
	callerID := c.GetString(middleware.CtxUserID)
	if targetID != callerID && !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "not permitted")
		return
	}

	fh, err := c.FormFile("avatar")
	if err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "avatar file required")
		return
	}
	if fh.Size > 5*1024*1024 {
		Err(c, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "avatar must be < 5 MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif":
	default:
		Err(c, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE",
			"allowed: jpg, jpeg, png, webp, gif")
		return
	}

	ctx := c.Request.Context()

	// Look up previous file to delete
	var prev *string
	_ = h.DB.QueryRow(ctx, `SELECT avatar_path FROM users WHERE id = $1`, targetID).Scan(&prev)

	stored := fmt.Sprintf("%s_%s%s", targetID, uuid.NewString()[:8], ext)
	dst := filepath.Join(AvatarDir, stored)

	src, err := fh.Open()
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer src.Close()
	out, err := os.Create(dst)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if _, err := io.Copy(out, src); err != nil {
		out.Close()
		_ = os.Remove(dst)
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	out.Close()

	_, err = h.DB.Exec(ctx,
		`UPDATE users SET avatar_path = $1, updated_at = NOW() WHERE id = $2`,
		stored, targetID)
	if err != nil {
		_ = os.Remove(dst)
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// Delete previous file after DB commit (best-effort)
	if prev != nil && *prev != "" && *prev != stored {
		_ = os.Remove(filepath.Join(AvatarDir, *prev))
	}

	OK(c, gin.H{"avatar_path": stored})
}

// Delete: DELETE /users/:id/avatar (self or admin)
func (h *AvatarHandler) Delete(c *gin.Context) {
	targetID := c.Param("id")
	callerID := c.GetString(middleware.CtxUserID)
	if targetID != callerID && !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "not permitted")
		return
	}
	ctx := c.Request.Context()
	var prev *string
	_ = h.DB.QueryRow(ctx, `SELECT avatar_path FROM users WHERE id = $1`, targetID).Scan(&prev)
	_, _ = h.DB.Exec(ctx, `UPDATE users SET avatar_path = NULL, updated_at = NOW() WHERE id = $1`, targetID)
	if prev != nil && *prev != "" {
		_ = os.Remove(filepath.Join(AvatarDir, *prev))
	}
	OK(c, gin.H{"ok": true})
}
