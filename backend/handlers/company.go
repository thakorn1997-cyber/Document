package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/middleware"
)

type CompanyHandler struct {
	DB *pgxpool.Pool
}

func NewCompanyHandler(db *pgxpool.Pool) *CompanyHandler {
	return &CompanyHandler{DB: db}
}

type company struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	WorkOrder string `json:"work_order"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

type companyUpsert struct {
	Name      string  `json:"name" binding:"required"`
	WorkOrder *string `json:"work_order,omitempty"`
	IsActive  *bool   `json:"is_active,omitempty"`
}

func (h *CompanyHandler) scan(query string) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := h.DB.Query(c.Request.Context(), query)
		if err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		defer rows.Close()
		items := []company{}
		for rows.Next() {
			var it company
			var createdAt any
			if err := rows.Scan(&it.ID, &it.Name, &it.WorkOrder, &it.IsActive, &createdAt); err != nil {
				continue
			}
			if t, ok := createdAt.(interface{ Format(string) string }); ok {
				it.CreatedAt = t.Format("2006-01-02T15:04:05Z07:00")
			}
			items = append(items, it)
		}
		OK(c, items)
	}
}

// List returns active companies (for the document form dropdown).
func (h *CompanyHandler) List(c *gin.Context) {
	h.scan(`SELECT id, name, work_order, is_active, created_at FROM companies
	         WHERE is_active = TRUE ORDER BY name`)(c)
}

// ListAll returns all companies incl. inactive (admin).
func (h *CompanyHandler) ListAll(c *gin.Context) {
	h.scan(`SELECT id, name, work_order, is_active, created_at FROM companies ORDER BY name`)(c)
}

func (h *CompanyHandler) Create(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	var req companyUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "ชื่อบริษัทห้ามว่าง")
		return
	}
	workOrder := ""
	if req.WorkOrder != nil {
		workOrder = strings.TrimSpace(*req.WorkOrder)
	}
	var id string
	err := h.DB.QueryRow(c.Request.Context(), `
		INSERT INTO companies (name, work_order, is_active) VALUES ($1, $2, COALESCE($3, TRUE))
		RETURNING id::text`, name, workOrder, req.IsActive).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			Err(c, http.StatusConflict, "DUPLICATE", "ชื่อบริษัทนี้มีอยู่แล้ว")
			return
		}
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	Created(c, gin.H{"id": id})
}

func (h *CompanyHandler) Update(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	var req companyUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "ชื่อบริษัทห้ามว่าง")
		return
	}
	var workOrder *string
	if req.WorkOrder != nil {
		w := strings.TrimSpace(*req.WorkOrder)
		workOrder = &w
	}
	ctx := c.Request.Context()

	// Documents store company_name by VALUE (no FK — the form field is creatable),
	// so a master rename must cascade manually or existing docs keep the old name.
	// Read the current name first to detect a rename.
	var oldName string
	if err := h.DB.QueryRow(ctx, `SELECT name FROM companies WHERE id = $1`, id).Scan(&oldName); err != nil {
		Err(c, http.StatusNotFound, "NOT_FOUND", "company not found")
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE companies SET name = $1, work_order = COALESCE($2, work_order),
		       is_active = COALESCE($3, is_active), updated_at = NOW()
		 WHERE id = $4`, name, workOrder, req.IsActive, id)
	if err != nil {
		if isUniqueViolation(err) {
			Err(c, http.StatusConflict, "DUPLICATE", "ชื่อบริษัทนี้มีอยู่แล้ว")
			return
		}
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "company not found")
		return
	}

	// Cascade the rename to every document that still carries the old name
	// (exact match only — free-typed names that never matched the master are
	// intentionally left alone), and audit the bulk change.
	var renamed int64
	if oldName != name {
		dt, err := tx.Exec(ctx,
			`UPDATE documents SET company_name = $1, updated_at = NOW() WHERE company_name = $2`,
			name, oldName)
		if err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		renamed = dt.RowsAffected()
		if renamed > 0 {
			writeAudit(ctx, tx, c.GetString(middleware.CtxUserID), "RENAME_COMPANY", "Company", id,
				gin.H{"old_name": oldName, "new_name": name, "documents_updated": renamed})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true, "documents_renamed": renamed})
}

// Delete hard-removes a company, but only when it is not referenced by any
// document. Documents store company_name as a plain string (no FK), so removal
// never breaks existing docs — they keep their names — yet we still block while
// the name is in use so an admin doesn't silently drop a still-used master row.
func (h *CompanyHandler) Delete(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	ctx := c.Request.Context()

	var name string
	if err := h.DB.QueryRow(ctx, `SELECT name FROM companies WHERE id = $1`, id).Scan(&name); err != nil {
		Err(c, http.StatusNotFound, "NOT_FOUND", "company not found")
		return
	}
	var used int
	_ = h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM documents WHERE company_name = $1`, name).Scan(&used)
	if used > 0 {
		Err(c, http.StatusConflict, "IN_USE",
			fmt.Sprintf("ลบไม่ได้ บริษัทนี้ถูกใช้งานอยู่ใน %d เอกสาร", used))
		return
	}
	tag, err := h.DB.Exec(ctx, `DELETE FROM companies WHERE id = $1`, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "company not found")
		return
	}
	OK(c, gin.H{"ok": true})
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
