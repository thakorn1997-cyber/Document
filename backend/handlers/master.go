package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/models"
)

type MasterHandler struct {
	DB *pgxpool.Pool
}

func NewMasterHandler(db *pgxpool.Pool) *MasterHandler {
	return &MasterHandler{DB: db}
}

func (h *MasterHandler) ListDepartments(c *gin.Context) {
	ctx := c.Request.Context()
	rows, err := h.DB.Query(ctx,
		`SELECT id, code, name_th, name_en, is_active FROM departments WHERE is_active = TRUE ORDER BY code`)
	if err != nil {
		Err(c, 500, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()

	items := []models.Department{}
	for rows.Next() {
		var d models.Department
		if err := rows.Scan(&d.ID, &d.Code, &d.NameTH, &d.NameEN, &d.IsActive); err != nil {
			Err(c, 500, "INTERNAL_ERROR", err.Error())
			return
		}
		items = append(items, d)
	}
	OK(c, items)
}

type userLite struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	FullName string `json:"full_name"`
}

func (h *MasterHandler) ListUsers(c *gin.Context) {
	q := "%" + c.Query("q") + "%"
	rows, err := h.DB.Query(c.Request.Context(), `
		SELECT id, username, email, full_name
		  FROM users
		 WHERE is_active = TRUE
		   AND ($1 = '%%' OR full_name ILIKE $1 OR email ILIKE $1 OR username ILIKE $1)
		 ORDER BY full_name
		 LIMIT 200`, q)
	if err != nil {
		Err(c, 500, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()
	items := []userLite{}
	for rows.Next() {
		var u userLite
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.FullName); err == nil {
			items = append(items, u)
		}
	}
	OK(c, items)
}

func (h *MasterHandler) ListDocumentTypes(c *gin.Context) {
	ctx := c.Request.Context()
	rows, err := h.DB.Query(ctx,
		`SELECT id, code, name, require_acknowledge, allowed_mime_types, max_file_size_mb
		   FROM document_types WHERE is_active = TRUE ORDER BY code`)
	if err != nil {
		Err(c, 500, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()

	items := []models.DocumentType{}
	for rows.Next() {
		var t models.DocumentType
		if err := rows.Scan(&t.ID, &t.Code, &t.Name, &t.RequireAcknowledge,
			&t.AllowedMimeTypes, &t.MaxFileSizeMB); err != nil {
			Err(c, 500, "INTERNAL_ERROR", err.Error())
			return
		}
		items = append(items, t)
	}
	OK(c, items)
}
