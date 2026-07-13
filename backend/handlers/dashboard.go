package handlers

import (
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/middleware"
)

type DashboardHandler struct {
	DB *pgxpool.Pool
}

func NewDashboardHandler(db *pgxpool.Pool) *DashboardHandler {
	return &DashboardHandler{DB: db}
}

type dailyCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type statusCount struct {
	Pending int `json:"pending"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
}

type statusBreakdown struct {
	UAT statusCount `json:"uat"`
	UAI statusCount `json:"uai"`
}

type activityItem struct {
	Kind        string    `json:"kind"` // "upload" | "acknowledge" | "edit"
	DocumentID  string    `json:"document_id"`
	CompanyName string    `json:"company_name"`
	WorkOrder   string    `json:"work_order"`
	ActorID     *string   `json:"actor_id,omitempty"`
	ActorName   *string   `json:"actor_name,omitempty"`
	ActorAvatar *string   `json:"actor_avatar,omitempty"`
	At          time.Time `json:"at"`
}

type dashboardResponse struct {
	Total      int64          `json:"total"`
	Mine       int64          `json:"mine"`
	PendingAck int64          `json:"pending_ack"`
	AckedToday int64          `json:"acked_today"`
	TrendPct   float64        `json:"trend_pct"`
	TrendIsNew bool           `json:"trend_is_new"` // last week had 0 docs but this week has some — a % is meaningless, show a "+N new" count instead
	ThisWeek   int64          `json:"this_week"`
	Daily      []dailyCount    `json:"daily"`
	Statuses   statusBreakdown `json:"statuses"`
	Activity   []activityItem  `json:"activity"`
}

func (h *DashboardHandler) Get(c *gin.Context) {
	userID := c.GetString(middleware.CtxUserID)
	ctx := c.Request.Context()

	var resp dashboardResponse

	// Totals
	_ = h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM documents`).Scan(&resp.Total)

	_ = h.DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM documents WHERE owner_user_id = $1`, userID).Scan(&resp.Mine)

	_ = h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM documents d
		 WHERE NOT EXISTS (SELECT 1 FROM acknowledgements WHERE document_id = d.id)`).
		Scan(&resp.PendingAck)

	_ = h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM acknowledgements
		 WHERE acknowledged_at::date = CURRENT_DATE`).Scan(&resp.AckedToday)

	// Weekly trend
	var thisWeek, lastWeek int64
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
		  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
		                     AND created_at < CURRENT_DATE - INTERVAL '7 days')
		  FROM documents`).Scan(&thisWeek, &lastWeek)
	resp.ThisWeek = thisWeek
	if lastWeek == 0 {
		// No baseline to compute a percentage from — flag it so the UI shows "+N new"
		// (a raw 100% here reads as "grew 100%", which is misleading).
		resp.TrendIsNew = thisWeek > 0
	} else {
		resp.TrendPct = float64(thisWeek-lastWeek) / float64(lastWeek) * 100
	}

	// Daily counts (7 days)
	resp.Daily = []dailyCount{}
	rows, err := h.DB.Query(ctx, `
		WITH days AS (
		  SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day')::date AS d
		)
		SELECT to_char(d.d, 'YYYY-MM-DD'),
		       COALESCE((SELECT COUNT(*) FROM documents WHERE created_at::date = d.d), 0)
		  FROM days d
		 ORDER BY d.d`)
	if err == nil {
		for rows.Next() {
			var dc dailyCount
			if err := rows.Scan(&dc.Date, &dc.Count); err == nil {
				resp.Daily = append(resp.Daily, dc)
			}
		}
		rows.Close()
	}

	// Status breakdown — UAT + UAI, counts per Pending/Passed/Failed
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  COUNT(*) FILTER (WHERE uat_status = 'Pending'),
		  COUNT(*) FILTER (WHERE uat_status = 'Passed'),
		  COUNT(*) FILTER (WHERE uat_status = 'Failed'),
		  COUNT(*) FILTER (WHERE uai_status = 'Pending'),
		  COUNT(*) FILTER (WHERE uai_status = 'Passed'),
		  COUNT(*) FILTER (WHERE uai_status = 'Failed')
		  FROM documents`).
		Scan(&resp.Statuses.UAT.Pending, &resp.Statuses.UAT.Passed, &resp.Statuses.UAT.Failed,
			&resp.Statuses.UAI.Pending, &resp.Statuses.UAI.Passed, &resp.Statuses.UAI.Failed)

	// Activity feed — merge recent uploads + acks
	activity := []activityItem{}

	upRows, err := h.DB.Query(ctx, `
		SELECT d.id::text, COALESCE(d.company_name,''), COALESCE(d.work_order,''),
		       u.id::text, u.full_name, u.avatar_path, d.created_at
		  FROM documents d
		  LEFT JOIN users u ON u.id = d.owner_user_id
		 ORDER BY d.created_at DESC LIMIT 20`)
	if err == nil {
		for upRows.Next() {
			var a activityItem
			a.Kind = "upload"
			if err := upRows.Scan(&a.DocumentID, &a.CompanyName, &a.WorkOrder,
				&a.ActorID, &a.ActorName, &a.ActorAvatar, &a.At); err == nil {
				activity = append(activity, a)
			}
		}
		upRows.Close()
	}

	ackRows, err := h.DB.Query(ctx, `
		SELECT d.id::text, COALESCE(d.company_name,''), COALESCE(d.work_order,''),
		       u.id::text, u.full_name, u.avatar_path, a.acknowledged_at
		  FROM acknowledgements a
		  JOIN users u ON u.id = a.user_id
		  JOIN documents d ON d.id = a.document_id
		 ORDER BY a.acknowledged_at DESC LIMIT 20`)
	if err == nil {
		for ackRows.Next() {
			var a activityItem
			a.Kind = "acknowledge"
			if err := ackRows.Scan(&a.DocumentID, &a.CompanyName, &a.WorkOrder,
				&a.ActorID, &a.ActorName, &a.ActorAvatar, &a.At); err == nil {
				activity = append(activity, a)
			}
		}
		ackRows.Close()
	}

	// Document edits (from the audit log). Only surfaces docs that still exist
	// (INNER JOIN drops UPDATEs on since-deleted documents).
	editRows, err := h.DB.Query(ctx, `
		SELECT d.id::text, COALESCE(d.company_name,''), COALESCE(d.work_order,''),
		       u.id::text, u.full_name, u.avatar_path, a.created_at
		  FROM audit_logs a
		  JOIN documents d ON d.id::text = a.target_id
		  LEFT JOIN users u ON u.id = a.actor_user_id
		 WHERE a.action = 'UPDATE' AND a.target_type = 'Document'
		 ORDER BY a.created_at DESC LIMIT 20`)
	if err == nil {
		for editRows.Next() {
			var a activityItem
			a.Kind = "edit"
			if err := editRows.Scan(&a.DocumentID, &a.CompanyName, &a.WorkOrder,
				&a.ActorID, &a.ActorName, &a.ActorAvatar, &a.At); err == nil {
				activity = append(activity, a)
			}
		}
		editRows.Close()
	}

	// Sort by At desc, cap at 10
	sort.SliceStable(activity, func(i, j int) bool { return activity[i].At.After(activity[j].At) })
	if len(activity) > 20 {
		activity = activity[:20]
	}
	resp.Activity = activity

	c.JSON(http.StatusOK, gin.H{"data": resp})
}

// Daily returns the documents-per-day series for an inclusive [from, to] range.
// Missing/invalid params default to the last 7 days. Range is capped at 366 days.
func (h *DashboardHandler) Daily(c *gin.Context) {
	ctx := c.Request.Context()
	const layout = "2006-01-02"

	now := time.Now()
	toDate := now
	fromDate := now.AddDate(0, 0, -6)
	if v := c.Query("to"); v != "" {
		if t, err := time.Parse(layout, v); err == nil {
			toDate = t
		}
	}
	if v := c.Query("from"); v != "" {
		if t, err := time.Parse(layout, v); err == nil {
			fromDate = t
		}
	}
	if fromDate.After(toDate) {
		fromDate, toDate = toDate, fromDate
	}
	if toDate.Sub(fromDate) > 366*24*time.Hour {
		fromDate = toDate.AddDate(0, 0, -366)
	}

	daily := []dailyCount{}
	rows, err := h.DB.Query(ctx, `
		WITH days AS (
		  SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS d
		)
		SELECT to_char(d.d, 'YYYY-MM-DD'),
		       COALESCE((SELECT COUNT(*) FROM documents WHERE created_at::date = d.d), 0)
		  FROM days d
		 ORDER BY d.d`,
		fromDate.Format(layout), toDate.Format(layout))
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()
	for rows.Next() {
		var dc dailyCount
		if err := rows.Scan(&dc.Date, &dc.Count); err == nil {
			daily = append(daily, dc)
		}
	}
	OK(c, daily)
}
