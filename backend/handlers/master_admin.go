package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/models"
)

// MasterAdminHandler exposes CRUD for Department and Position (admin only writes).
type MasterAdminHandler struct {
	DB *pgxpool.Pool
}

func NewMasterAdminHandler(db *pgxpool.Pool) *MasterAdminHandler {
	return &MasterAdminHandler{DB: db}
}

// -------- Departments --------

type deptUpsert struct {
	Code     string `json:"code" binding:"required"`
	NameTH   string `json:"name_th" binding:"required"`
	NameEN   string `json:"name_en"`
	IsActive *bool  `json:"is_active,omitempty"`
}

// ListAll returns all departments (including inactive) for admin.
func (h *MasterAdminHandler) ListDepartmentsAll(c *gin.Context) {
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, code, name_th, name_en, is_active FROM departments ORDER BY code`)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()
	items := []models.Department{}
	for rows.Next() {
		var d models.Department
		if err := rows.Scan(&d.ID, &d.Code, &d.NameTH, &d.NameEN, &d.IsActive); err == nil {
			items = append(items, d)
		}
	}
	OK(c, items)
}

func (h *MasterAdminHandler) CreateDepartment(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	var req deptUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	if req.NameEN == "" {
		req.NameEN = req.NameTH
	}
	var id string
	err := h.DB.QueryRow(c.Request.Context(), `
		INSERT INTO departments (code, name_th, name_en, is_active)
		VALUES ($1, $2, $3, COALESCE($4, TRUE))
		RETURNING id::text`,
		strings.TrimSpace(req.Code), strings.TrimSpace(req.NameTH),
		strings.TrimSpace(req.NameEN), req.IsActive,
	).Scan(&id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	Created(c, gin.H{"id": id})
}

func (h *MasterAdminHandler) UpdateDepartment(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	var req deptUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	_, err := h.DB.Exec(c.Request.Context(), `
		UPDATE departments
		   SET code = $1, name_th = $2, name_en = $3,
		       is_active = COALESCE($4, is_active)
		 WHERE id = $5`,
		strings.TrimSpace(req.Code), strings.TrimSpace(req.NameTH),
		strings.TrimSpace(req.NameEN), req.IsActive, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true})
}

// DeleteDepartment hard-removes a department only when nothing references it
// (documents, acknowledgements, recipients, download logs, staff, or user
// assignments). All those FKs are NO ACTION / CASCADE, so we block on any use.
func (h *MasterAdminHandler) DeleteDepartment(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	ctx := c.Request.Context()

	var used int
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM documents WHERE source_department_id = $1) +
		  (SELECT COUNT(*) FROM acknowledgements WHERE department_id = $1) +
		  (SELECT COUNT(*) FROM document_recipients WHERE target_department_id = $1) +
		  (SELECT COUNT(*) FROM download_logs WHERE downloaded_department_id = $1) +
		  (SELECT COUNT(*) FROM staff_master WHERE department_id = $1) +
		  (SELECT COUNT(*) FROM user_departments WHERE department_id = $1)`, id).Scan(&used)
	if used > 0 {
		Err(c, http.StatusConflict, "IN_USE",
			fmt.Sprintf("ลบไม่ได้ แผนกนี้ถูกใช้งานอยู่ %d รายการ (เอกสาร/พนักงาน/ผู้ใช้)", used))
		return
	}
	tag, err := h.DB.Exec(ctx, `DELETE FROM departments WHERE id = $1`, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "department not found")
		return
	}
	OK(c, gin.H{"ok": true})
}

// -------- Positions --------

type positionUpsert struct {
	Code     string `json:"code" binding:"required"`
	Name     string `json:"name" binding:"required"`
	IsActive *bool  `json:"is_active,omitempty"`
}

func (h *MasterAdminHandler) ListPositions(c *gin.Context) {
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, code, name, is_active FROM positions
		   WHERE is_active = TRUE ORDER BY code`)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()
	items := []models.Position{}
	for rows.Next() {
		var p models.Position
		if err := rows.Scan(&p.ID, &p.Code, &p.Name, &p.IsActive); err == nil {
			items = append(items, p)
		}
	}
	OK(c, items)
}

func (h *MasterAdminHandler) ListPositionsAll(c *gin.Context) {
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, code, name, is_active FROM positions ORDER BY code`)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()
	items := []models.Position{}
	for rows.Next() {
		var p models.Position
		if err := rows.Scan(&p.ID, &p.Code, &p.Name, &p.IsActive); err == nil {
			items = append(items, p)
		}
	}
	OK(c, items)
}

func (h *MasterAdminHandler) CreatePosition(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	var req positionUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	var id string
	err := h.DB.QueryRow(c.Request.Context(), `
		INSERT INTO positions (code, name, is_active)
		VALUES ($1, $2, COALESCE($3, TRUE))
		RETURNING id::text`,
		strings.TrimSpace(req.Code), strings.TrimSpace(req.Name), req.IsActive,
	).Scan(&id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	Created(c, gin.H{"id": id})
}

func (h *MasterAdminHandler) UpdatePosition(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	var req positionUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	_, err := h.DB.Exec(c.Request.Context(), `
		UPDATE positions
		   SET code = $1, name = $2,
		       is_active = COALESCE($3, is_active)
		 WHERE id = $4`,
		strings.TrimSpace(req.Code), strings.TrimSpace(req.Name), req.IsActive, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true})
}

// DeletePosition hard-removes a level/position only when no staff or user is
// assigned to it (both FKs are NO ACTION).
func (h *MasterAdminHandler) DeletePosition(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	ctx := c.Request.Context()

	var used int
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM staff_master WHERE position_id = $1) +
		  (SELECT COUNT(*) FROM users WHERE position_id = $1)`, id).Scan(&used)
	if used > 0 {
		Err(c, http.StatusConflict, "IN_USE",
			fmt.Sprintf("ลบไม่ได้ ระดับนี้ถูกใช้งานอยู่ %d รายการ (พนักงาน/ผู้ใช้)", used))
		return
	}
	tag, err := h.DB.Exec(ctx, `DELETE FROM positions WHERE id = $1`, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "position not found")
		return
	}
	OK(c, gin.H{"ok": true})
}
