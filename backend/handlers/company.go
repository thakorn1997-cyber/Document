package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
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
	tag, err := h.DB.Exec(c.Request.Context(), `
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
	OK(c, gin.H{"ok": true})
}

// Delete soft-deletes (is_active=false) — keeps historical document names intact.
func (h *CompanyHandler) Delete(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	_, err := h.DB.Exec(c.Request.Context(),
		`UPDATE companies SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true})
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
