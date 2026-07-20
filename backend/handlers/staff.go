package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/models"
)

type StaffHandler struct {
	DB *pgxpool.Pool
}

func NewStaffHandler(db *pgxpool.Pool) *StaffHandler {
	return &StaffHandler{DB: db}
}

type staffUpsert struct {
	EmployeeID   string  `json:"employee_id" binding:"required"`
	FullName     string  `json:"full_name" binding:"required"`
	DepartmentID *string `json:"department_id,omitempty"`
	PositionID   *string `json:"position_id,omitempty"`
	IsActive     *bool   `json:"is_active,omitempty"`
}

// List returns active staff (for dropdowns).
func (h *StaffHandler) List(c *gin.Context) {
	rows, err := h.DB.Query(c.Request.Context(), `
		SELECT s.id, s.employee_id, s.full_name, s.department_id, s.position_id,
		       d.code, d.name_th, d.name_en, d.is_active,
		       p.code, p.name, p.is_active,
		       s.is_active, s.created_at
		  FROM staff_master s
		  LEFT JOIN departments d ON d.id = s.department_id
		  LEFT JOIN positions p ON p.id = s.position_id
		 WHERE s.is_active = TRUE
		 ORDER BY s.full_name`)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()

	items := []models.Staff{}
	for rows.Next() {
		var s models.Staff
		var dCode, dNameTH, dNameEN *string
		var dActive *bool
		var pCode, pName *string
		var pActive *bool
		if err := rows.Scan(&s.ID, &s.EmployeeID, &s.FullName, &s.DepartmentID, &s.PositionID,
			&dCode, &dNameTH, &dNameEN, &dActive,
			&pCode, &pName, &pActive,
			&s.IsActive, &s.CreatedAt); err != nil {
			continue
		}
		if s.DepartmentID != nil && dCode != nil {
			s.Department = &models.Department{
				ID: *s.DepartmentID, Code: *dCode, NameTH: *dNameTH, NameEN: *dNameEN,
				IsActive: dActive != nil && *dActive,
			}
		}
		if s.PositionID != nil && pCode != nil {
			s.Position = &models.Position{
				ID: *s.PositionID, Code: *pCode, Name: *pName,
				IsActive: pActive != nil && *pActive,
			}
		}
		items = append(items, s)
	}
	OK(c, items)
}

// ListAll — includes inactive (admin only).
func (h *StaffHandler) ListAll(c *gin.Context) {
	rows, err := h.DB.Query(c.Request.Context(), `
		SELECT s.id, s.employee_id, s.full_name, s.department_id, s.position_id,
		       d.code, d.name_th, d.name_en, d.is_active,
		       p.code, p.name, p.is_active,
		       s.is_active, s.created_at
		  FROM staff_master s
		  LEFT JOIN departments d ON d.id = s.department_id
		  LEFT JOIN positions p ON p.id = s.position_id
		 ORDER BY s.full_name`)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()

	items := []models.Staff{}
	for rows.Next() {
		var s models.Staff
		var dCode, dNameTH, dNameEN *string
		var dActive *bool
		var pCode, pName *string
		var pActive *bool
		if err := rows.Scan(&s.ID, &s.EmployeeID, &s.FullName, &s.DepartmentID, &s.PositionID,
			&dCode, &dNameTH, &dNameEN, &dActive,
			&pCode, &pName, &pActive,
			&s.IsActive, &s.CreatedAt); err != nil {
			continue
		}
		if s.DepartmentID != nil && dCode != nil {
			s.Department = &models.Department{
				ID: *s.DepartmentID, Code: *dCode, NameTH: *dNameTH, NameEN: *dNameEN,
				IsActive: dActive != nil && *dActive,
			}
		}
		if s.PositionID != nil && pCode != nil {
			s.Position = &models.Position{
				ID: *s.PositionID, Code: *pCode, Name: *pName,
				IsActive: pActive != nil && *pActive,
			}
		}
		items = append(items, s)
	}
	OK(c, items)
}

func (h *StaffHandler) Create(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	var req staffUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	var id string
	err := h.DB.QueryRow(c.Request.Context(), `
		INSERT INTO staff_master (employee_id, full_name, department_id, position_id, is_active)
		VALUES ($1, $2, $3, $4, COALESCE($5, TRUE))
		RETURNING id::text`,
		strings.TrimSpace(req.EmployeeID),
		strings.TrimSpace(req.FullName),
		nilIfEmptyPtr(req.DepartmentID),
		nilIfEmptyPtr(req.PositionID),
		req.IsActive,
	).Scan(&id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	Created(c, gin.H{"id": id})
}

func (h *StaffHandler) Update(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	var req staffUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}
	_, err := h.DB.Exec(c.Request.Context(), `
		UPDATE staff_master
		   SET employee_id = $1, full_name = $2,
		       department_id = $3, position_id = $4,
		       is_active = COALESCE($5, is_active),
		       updated_at = NOW()
		 WHERE id = $6`,
		strings.TrimSpace(req.EmployeeID),
		strings.TrimSpace(req.FullName),
		nilIfEmptyPtr(req.DepartmentID),
		nilIfEmptyPtr(req.PositionID),
		req.IsActive, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true})
}

// Delete hard-removes a staff member, blocked while they are still set as the
// owner_project_staff of any document (FK is NO ACTION, so a raw delete would
// error anyway — we surface a clear message instead).
func (h *StaffHandler) Delete(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	ctx := c.Request.Context()

	var used int
	_ = h.DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM documents WHERE owner_project_staff_id = $1`, id).Scan(&used)
	if used > 0 {
		Err(c, http.StatusConflict, "IN_USE",
			fmt.Sprintf("ลบไม่ได้ พนักงานนี้ถูกใช้เป็นผู้รับผิดชอบใน %d เอกสาร", used))
		return
	}
	tag, err := h.DB.Exec(ctx, `DELETE FROM staff_master WHERE id = $1`, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "staff not found")
		return
	}
	OK(c, gin.H{"ok": true})
}

func nilIfEmptyPtr(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}
