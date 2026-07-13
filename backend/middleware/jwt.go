package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"project-document/backend/utils"
)

const CtxUserID = "user_id"
const CtxUserRoles = "user_roles"

func JWTAuth(accessSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			unauthorized(c, "missing bearer token")
			return
		}
		tok := strings.TrimPrefix(h, "Bearer ")
		claims, err := utils.ParseToken(tok, accessSecret)
		if err != nil {
			unauthorized(c, "invalid token")
			return
		}
		if claims.Type != utils.AccessToken {
			unauthorized(c, "wrong token type")
			return
		}
		c.Set(CtxUserID, claims.UserID)
		c.Next()
	}
}

func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := c.Get(CtxUserRoles)
		if !ok {
			forbidden(c)
			return
		}
		userRoles, _ := raw.([]string)
		set := make(map[string]struct{}, len(userRoles))
		for _, r := range userRoles {
			set[r] = struct{}{}
		}
		for _, need := range roles {
			if _, ok := set[need]; ok {
				c.Next()
				return
			}
		}
		forbidden(c)
	}
}

func unauthorized(c *gin.Context, msg string) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
		"error": gin.H{"code": "UNAUTHORIZED", "message": msg},
	})
}

func forbidden(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
		"error": gin.H{"code": "FORBIDDEN", "message": "insufficient permission"},
	})
}
