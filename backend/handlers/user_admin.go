package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/models"
)

type UserAdminHandler struct {
	DB *pgxpool.Pool
}

func NewUserAdminHandler(db *pgxpool.Pool) *UserAdminHandler {
	return &UserAdminHandler{DB: db}
}

type userFull struct {
	ID          string              `json:"id"`
	Username    string              `json:"username"`
	Email       string              `json:"email"`
	FullName    string              `json:"full_name"`
	EmployeeID  *string             `json:"employee_id,omitempty"`
	PositionID  *string             `json:"position_id,omitempty"`
	Position    *models.Position    `json:"position,omitempty"`
	AvatarPath  *string             `json:"avatar_path,omitempty"`
	IsActive    bool                `json:"is_active"`
	CreatedAt   string              `json:"created_at"`
	Roles       []string            `json:"roles"`
	Departments []models.Department `json:"departments"`
}

// List returns full user profiles (admin use).
func (h *UserAdminHandler) List(c *gin.Context) {
	ctx := c.Request.Context()

	rows, err := h.DB.Query(ctx, `
		SELECT u.id, u.username, u.email, u.full_name, u.employee_id,
		       u.position_id, p.code, p.name, p.is_active,
		       u.avatar_path, u.is_active, u.created_at
		  FROM users u
		  LEFT JOIN positions p ON p.id = u.position_id
		 ORDER BY u.full_name`)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()

	users := []userFull{}
	ids := []string{}
	for rows.Next() {
		var u userFull
		var createdAt any
		var posCode, posName *string
		var posActive *bool
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.FullName,
			&u.EmployeeID, &u.PositionID, &posCode, &posName, &posActive,
			&u.AvatarPath, &u.IsActive, &createdAt); err != nil {
			continue
		}
		if u.PositionID != nil && posCode != nil {
			u.Position = &models.Position{
				ID: *u.PositionID, Code: *posCode, Name: *posName,
				IsActive: posActive != nil && *posActive,
			}
		}
		if t, ok := createdAt.(interface{ Format(string) string }); ok {
			u.CreatedAt = t.Format("2006-01-02T15:04:05Z07:00")
		}
		users = append(users, u)
		ids = append(ids, u.ID)
	}

	if len(users) == 0 {
		OK(c, users)
		return
	}

	// Bulk fetch roles
	roleMap := map[string][]string{}
	rrows, _ := h.DB.Query(ctx,
		`SELECT user_id::text, role FROM user_roles WHERE user_id = ANY($1)`, ids)
	if rrows != nil {
		for rrows.Next() {
			var uid, r string
			if err := rrows.Scan(&uid, &r); err == nil {
				roleMap[uid] = append(roleMap[uid], r)
			}
		}
		rrows.Close()
	}

	// Bulk fetch departments
	deptMap := map[string][]models.Department{}
	drows, _ := h.DB.Query(ctx, `
		SELECT ud.user_id::text, d.id, d.code, d.name_th, d.name_en, d.is_active
		  FROM user_departments ud
		  JOIN departments d ON d.id = ud.department_id
		 WHERE ud.user_id = ANY($1)`, ids)
	if drows != nil {
		for drows.Next() {
			var uid string
			var d models.Department
			if err := drows.Scan(&uid, &d.ID, &d.Code, &d.NameTH, &d.NameEN, &d.IsActive); err == nil {
				deptMap[uid] = append(deptMap[uid], d)
			}
		}
		drows.Close()
	}

	for i := range users {
		users[i].Roles = roleMap[users[i].ID]
		if users[i].Roles == nil {
			users[i].Roles = []string{}
		}
		users[i].Departments = deptMap[users[i].ID]
		if users[i].Departments == nil {
			users[i].Departments = []models.Department{}
		}
	}

	OK(c, users)
}

type userPatchRequest struct {
	FullName      *string   `json:"full_name,omitempty"`
	EmployeeID    *string   `json:"employee_id,omitempty"`
	PositionID    *string   `json:"position_id,omitempty"`    // empty string = clear
	IsActive      *bool     `json:"is_active,omitempty"`
	IsAdmin       *bool     `json:"is_admin,omitempty"`       // convenience toggle
	Roles         *[]string `json:"roles,omitempty"`          // full replace
	DepartmentIDs *[]string `json:"department_ids,omitempty"` // full replace
}

// Patch updates user profile (admin only).
func (h *UserAdminHandler) Patch(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	var req userPatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}

	ctx := c.Request.Context()
	tx, err := h.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	// Basic profile fields
	if req.FullName != nil {
		if _, err := tx.Exec(ctx,
			`UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`,
			strings.TrimSpace(*req.FullName), id); err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
	}
	if req.EmployeeID != nil {
		v := strings.TrimSpace(*req.EmployeeID)
		var stored any = v
		if v == "" {
			stored = nil
		}
		if _, err := tx.Exec(ctx,
			`UPDATE users SET employee_id = $1, updated_at = NOW() WHERE id = $2`,
			stored, id); err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
	}
	if req.IsActive != nil {
		if _, err := tx.Exec(ctx,
			`UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`,
			*req.IsActive, id); err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
	}
	if req.PositionID != nil {
		v := strings.TrimSpace(*req.PositionID)
		var stored any = v
		if v == "" {
			stored = nil
		}
		if _, err := tx.Exec(ctx,
			`UPDATE users SET position_id = $1, updated_at = NOW() WHERE id = $2`,
			stored, id); err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
	}

	// Convenience toggle: is_admin adds/removes SystemAdmin
	if req.IsAdmin != nil {
		if *req.IsAdmin {
			if _, err := tx.Exec(ctx,
				`INSERT INTO user_roles (user_id, role) VALUES ($1, 'SystemAdmin')
				 ON CONFLICT DO NOTHING`, id); err != nil {
				Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
				return
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO user_roles (user_id, role) VALUES ($1, 'User')
				 ON CONFLICT DO NOTHING`, id); err != nil {
				Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
				return
			}
		} else {
			if _, err := tx.Exec(ctx,
				`DELETE FROM user_roles WHERE user_id = $1 AND role IN ('SystemAdmin','admin')`, id); err != nil {
				Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
				return
			}
			// ensure at least 'User' role remains
			if _, err := tx.Exec(ctx,
				`INSERT INTO user_roles (user_id, role) VALUES ($1, 'User')
				 ON CONFLICT DO NOTHING`, id); err != nil {
				Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
				return
			}
		}
	}

	// Roles full replace (skip if is_admin was used to keep simpler API)
	if req.Roles != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, id); err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		for _, r := range *req.Roles {
			r = strings.TrimSpace(r)
			if r == "" {
				continue
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)
				 ON CONFLICT DO NOTHING`, id, r); err != nil {
				Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
				return
			}
		}
	}

	// Departments full replace
	if req.DepartmentIDs != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM user_departments WHERE user_id = $1`, id); err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		for i, d := range *req.DepartmentIDs {
			d = strings.TrimSpace(d)
			if d == "" {
				continue
			}
			isDefault := i == 0
			if _, err := tx.Exec(ctx,
				`INSERT INTO user_departments (user_id, department_id, is_default)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (user_id, department_id) DO UPDATE SET is_default = EXCLUDED.is_default`,
				id, d, isDefault); err != nil {
				Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
				return
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	OK(c, gin.H{"ok": true})
}

// Delete soft-deletes user (sets is_active=false + revokes refresh tokens).
// Preserves history for audit_logs, download_logs, etc.
func (h *UserAdminHandler) Delete(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	ctx := c.Request.Context()

	tx, err := h.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	// Soft-delete: mark inactive
	tag, err := tx.Exec(ctx,
		`UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "user not found")
		return
	}

	// Revoke active sessions
	_, _ = tx.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW()
		  WHERE user_id = $1 AND revoked_at IS NULL`, id)

	if err := tx.Commit(ctx); err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true, "mode": "soft_delete"})
}

