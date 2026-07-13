package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/config"
	"project-document/backend/middleware"
	"project-document/backend/notify"
	"project-document/backend/utils"
)

type NotifHandler struct {
	Cfg *config.Config
	DB  *pgxpool.Pool
	Hub *notify.Hub
}

func NewNotifHandler(cfg *config.Config, db *pgxpool.Pool, hub *notify.Hub) *NotifHandler {
	return &NotifHandler{Cfg: cfg, DB: db, Hub: hub}
}

type notificationDTO struct {
	ID          string          `json:"id"`
	Kind        string          `json:"kind"`
	DocumentID  *string         `json:"document_id,omitempty"`
	ActorUserID *string         `json:"actor_user_id,omitempty"`
	ActorName   *string         `json:"actor_name,omitempty"`
	ActorAvatar *string         `json:"actor_avatar,omitempty"`
	Payload     json.RawMessage `json:"payload"`
	ReadAt      *time.Time      `json:"read_at,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

// List: GET /api/v1/notifications?limit=20&unread_only=true
func (h *NotifHandler) List(c *gin.Context) {
	userID := c.GetString(middleware.CtxUserID)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	unreadOnly := c.Query("unread_only") == "true"

	where := "n.user_id = $1"
	if unreadOnly {
		where += " AND n.read_at IS NULL"
	}

	rows, err := h.DB.Query(c.Request.Context(), `
		SELECT n.id::text, n.kind, n.document_id::text, n.actor_user_id::text,
		       u.full_name, u.avatar_path,
		       n.payload_json, n.read_at, n.created_at
		  FROM notifications n
		  LEFT JOIN users u ON u.id = n.actor_user_id
		 WHERE `+where+`
		 ORDER BY n.created_at DESC
		 LIMIT $2`, userID, limit)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()

	items := []notificationDTO{}
	for rows.Next() {
		var it notificationDTO
		var raw []byte
		if err := rows.Scan(&it.ID, &it.Kind, &it.DocumentID, &it.ActorUserID,
			&it.ActorName, &it.ActorAvatar, &raw, &it.ReadAt, &it.CreatedAt); err != nil {
			continue
		}
		it.Payload = raw
		items = append(items, it)
	}
	OK(c, items)
}

// UnreadCount: GET /api/v1/notifications/unread-count
func (h *NotifHandler) UnreadCount(c *gin.Context) {
	userID := c.GetString(middleware.CtxUserID)
	var count int64
	_ = h.DB.QueryRow(c.Request.Context(),
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
		userID).Scan(&count)
	OK(c, gin.H{"count": count})
}

// MarkRead: POST /api/v1/notifications/:id/read
func (h *NotifHandler) MarkRead(c *gin.Context) {
	userID := c.GetString(middleware.CtxUserID)
	id := c.Param("id")
	_, err := h.DB.Exec(c.Request.Context(),
		`UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
		id, userID)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true})
}

// MarkAllRead: POST /api/v1/notifications/read-all
func (h *NotifHandler) MarkAllRead(c *gin.Context) {
	userID := c.GetString(middleware.CtxUserID)
	_, err := h.DB.Exec(c.Request.Context(),
		`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`, userID)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true})
}

// Stream: GET /api/v1/notifications/stream?access_token=...
// SSE endpoint — EventSource can't send Authorization header, so token comes via query.
func (h *NotifHandler) Stream(c *gin.Context) {
	tokenStr := c.Query("access_token")
	if tokenStr == "" {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "access_token required")
		return
	}
	claims, err := utils.ParseToken(tokenStr, h.Cfg.JWTAccessSecret)
	if err != nil || claims.Type != utils.AccessToken {
		Err(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid token")
		return
	}
	userID := claims.UserID

	w := c.Writer
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// This connection is long-lived; clear the server's 5m WriteTimeout for it
	// so the stream isn't force-closed mid-session (harmless if unsupported).
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})

	ch := h.Hub.Subscribe(userID)
	defer h.Hub.Unsubscribe(userID, ch)

	_, _ = fmt.Fprintf(w, ": connected\n\n")
	w.Flush()

	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()

	closedCh := w.CloseNotify()
	ctx := c.Request.Context()

	for {
		select {
		case <-closedCh:
			return
		case <-ctx.Done():
			return
		case <-tick.C:
			_, _ = fmt.Fprintf(w, ": ping\n\n")
			w.Flush()
		case data, ok := <-ch:
			if !ok {
				return
			}
			_, _ = io.WriteString(w, "data: ")
			_, _ = w.Write(data)
			_, _ = io.WriteString(w, "\n\n")
			w.Flush()
		}
	}
}

// -------- Fanout helpers (called from other handlers after commit) --------

// FanoutCreated writes "document_created" notifications for all active users
// (except the uploader) and pushes them via SSE.
func FanoutCreated(db *pgxpool.Pool, hub *notify.Hub,
	docID, uploaderID string, payload map[string]any,
) {
	fanoutBroadcast(db, hub, docID, uploaderID, "document_created", payload)
}

// FanoutPassed writes "document_passed" notifications for all active users
// (except the actor) when a document's UAT/UAI status becomes Passed on save.
func FanoutPassed(db *pgxpool.Pool, hub *notify.Hub,
	docID, actorID string, payload map[string]any,
) {
	fanoutBroadcast(db, hub, docID, actorID, "document_passed", payload)
}

// fanoutBroadcast inserts a notification of the given kind for every active user
// except the actor, then pushes each one over SSE.
func fanoutBroadcast(db *pgxpool.Pool, hub *notify.Hub,
	docID, actorID, kind string, payload map[string]any,
) {
	// Runs in a goroutine — never let a panic take down the server.
	defer func() { _ = recover() }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	raw, _ := json.Marshal(payload)

	rows, err := db.Query(ctx, `
		INSERT INTO notifications (id, user_id, kind, document_id, actor_user_id, payload_json)
		SELECT gen_random_uuid(), u.id, $4, $1, $2, $3::jsonb
		  FROM users u
		 WHERE u.is_active = TRUE AND u.id != $2
		RETURNING id::text, user_id::text`, docID, actorID, raw, kind)
	if err != nil {
		return
	}
	defer rows.Close()

	var actorName, actorAvatar *string
	_ = db.QueryRow(ctx,
		`SELECT full_name, avatar_path FROM users WHERE id = $1`, actorID).
		Scan(&actorName, &actorAvatar)

	now := time.Now()
	for rows.Next() {
		var notifID, recipient string
		if err := rows.Scan(&notifID, &recipient); err != nil {
			continue
		}
		body := map[string]any{
			"id":            notifID,
			"kind":          kind,
			"document_id":   docID,
			"actor_user_id": actorID,
			"actor_name":    actorName,
			"actor_avatar":  actorAvatar,
			"payload":       payload,
			"created_at":    now,
		}
		if data, err := json.Marshal(body); err == nil {
			hub.Publish(recipient, data)
		}
	}
}

// FanoutAcknowledged notifies only the document uploader that someone acked their doc.
func FanoutAcknowledged(db *pgxpool.Pool, hub *notify.Hub,
	docID, ackerID string, payload map[string]any,
) {
	// Runs in a goroutine — never let a panic take down the server.
	defer func() { _ = recover() }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var uploaderID string
	if err := db.QueryRow(ctx,
		`SELECT owner_user_id::text FROM documents WHERE id = $1`, docID).
		Scan(&uploaderID); err != nil {
		return
	}
	if uploaderID == ackerID || uploaderID == "" {
		return
	}

	raw, _ := json.Marshal(payload)
	notifID := uuid.NewString()

	if _, err := db.Exec(ctx, `
		INSERT INTO notifications (id, user_id, kind, document_id, actor_user_id, payload_json)
		VALUES ($1, $2, 'document_acknowledged', $3, $4, $5::jsonb)`,
		notifID, uploaderID, docID, ackerID, raw); err != nil {
		return
	}

	var actorName, actorAvatar *string
	_ = db.QueryRow(ctx,
		`SELECT full_name, avatar_path FROM users WHERE id = $1`, ackerID).
		Scan(&actorName, &actorAvatar)

	body := map[string]any{
		"id":            notifID,
		"kind":          "document_acknowledged",
		"document_id":   docID,
		"actor_user_id": ackerID,
		"actor_name":    actorName,
		"actor_avatar":  actorAvatar,
		"payload":       payload,
		"created_at":    time.Now(),
	}
	if data, err := json.Marshal(body); err == nil {
		hub.Publish(uploaderID, data)
	}
}
