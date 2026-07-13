package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

const CtxDeptIDs = "user_dept_ids"

func LoadUserContext(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString(CtxUserID)
		if userID == "" {
			c.Next()
			return
		}
		ctx := c.Request.Context()

		var roles []string
		rows, err := pool.Query(ctx, `SELECT role FROM user_roles WHERE user_id = $1`, userID)
		if err == nil {
			for rows.Next() {
				var r string
				if rows.Scan(&r) == nil {
					roles = append(roles, r)
				}
			}
			rows.Close()
		}

		var deptIDs []string
		rows, err = pool.Query(ctx, `SELECT department_id::text FROM user_departments WHERE user_id = $1`, userID)
		if err == nil {
			for rows.Next() {
				var d string
				if rows.Scan(&d) == nil {
					deptIDs = append(deptIDs, d)
				}
			}
			rows.Close()
		}

		c.Set(CtxUserRoles, roles)
		c.Set(CtxDeptIDs, deptIDs)
		c.Next()
	}
}

func UserDeptIDs(c *gin.Context) []string {
	v, ok := c.Get(CtxDeptIDs)
	if !ok {
		return nil
	}
	ids, _ := v.([]string)
	return ids
}

func UserRoles(c *gin.Context) []string {
	v, ok := c.Get(CtxUserRoles)
	if !ok {
		return nil
	}
	roles, _ := v.([]string)
	return roles
}
