package handlers

import (
	"net/http"
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

	// All KPI numbers in ONE round-trip: a single scan over documents provides
	// total/mine/pending-ack/trend/status counts via FILTER, and the two
	// acknowledgement counters ride along as uncorrelated scalar subqueries.
	// (Was 6 separate queries — same results, same indexes, 1/6th the trips.)
	var thisWeek, lastWeek int64
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  COUNT(*),
		  COUNT(*) FILTER (WHERE owner_user_id = $1),
		  COUNT(*) FILTER (WHERE NOT EXISTS (
		      SELECT 1 FROM acknowledgements a WHERE a.document_id = documents.id)),
		  (SELECT COUNT(*) FROM acknowledgements WHERE acknowledged_at::date = CURRENT_DATE),
		  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
		  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
		                     AND created_at < CURRENT_DATE - INTERVAL '7 days'),
		  COUNT(*) FILTER (WHERE uat_status = 'Pending'),
		  COUNT(*) FILTER (WHERE uat_status = 'Passed'),
		  COUNT(*) FILTER (WHERE uat_status = 'Failed'),
		  COUNT(*) FILTER (WHERE uai_status = 'Pending'),
		  COUNT(*) FILTER (WHERE uai_status = 'Passed'),
		  COUNT(*) FILTER (WHERE uai_status = 'Failed')
		  FROM documents`, userID).
		Scan(&resp.Total, &resp.Mine, &resp.PendingAck, &resp.AckedToday,
			&thisWeek, &lastWeek,
			&resp.Statuses.UAT.Pending, &resp.Statuses.UAT.Passed, &resp.Statuses.UAT.Failed,
			&resp.Statuses.UAI.Pending, &resp.Statuses.UAI.Passed, &resp.Statuses.UAI.Failed)
	resp.ThisWeek = thisWeek
	if lastWeek == 0 {
		// No baseline to compute a percentage from — flag it so the UI shows "+N new"
		// (a raw 100% here reads as "grew 100%", which is misleading).
		resp.TrendIsNew = thisWeek > 0
	} else {
		resp.TrendPct = float64(thisWeek-lastWeek) / float64(lastWeek) * 100
	}

	// Daily counts (7 days). One range scan + GROUP BY joined onto the day series —
	// NOT a correlated per-day subquery: `created_at::date = d` casts every row and
	// can't use idx_documents_created_at, and would rescan documents once per day.
	resp.Daily = []dailyCount{}
	rows, err := h.DB.Query(ctx, `
		WITH days AS (
		  SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day')::date AS d
		), counts AS (
		  SELECT created_at::date AS d, COUNT(*) AS n
		    FROM documents
		   WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
		   GROUP BY 1
		)
		SELECT to_char(days.d, 'YYYY-MM-DD'), COALESCE(counts.n, 0)
		  FROM days LEFT JOIN counts ON counts.d = days.d
		 ORDER BY days.d`)
	if err == nil {
		for rows.Next() {
			var dc dailyCount
			if err := rows.Scan(&dc.Date, &dc.Count); err == nil {
				resp.Daily = append(resp.Daily, dc)
			}
		}
		rows.Close()
	}

	// Activity feed — uploads + acks + edits merged in ONE query (was 3).
	// Each branch keeps its own ORDER BY/LIMIT (so each uses its own index),
	// then the outer ORDER BY merges the ≤60 candidate rows and caps at 20.
	// Edits come from the audit log; the INNER JOIN on documents drops UPDATEs
	// on since-deleted documents.
	activity := []activityItem{}
	actRows, err := h.DB.Query(ctx, `
		SELECT kind, doc_id, company, work_order, actor_id, actor_name, actor_avatar, ts FROM (
		  (SELECT 'upload' AS kind, d.id::text AS doc_id,
		          COALESCE(d.company_name,'') AS company, COALESCE(d.work_order,'') AS work_order,
		          u.id::text AS actor_id, u.full_name AS actor_name, u.avatar_path AS actor_avatar,
		          d.created_at AS ts
		     FROM documents d
		     LEFT JOIN users u ON u.id = d.owner_user_id
		    ORDER BY d.created_at DESC LIMIT 20)
		  UNION ALL
		  (SELECT 'acknowledge', d.id::text, COALESCE(d.company_name,''), COALESCE(d.work_order,''),
		          u.id::text, u.full_name, u.avatar_path, a.acknowledged_at
		     FROM acknowledgements a
		     JOIN users u ON u.id = a.user_id
		     JOIN documents d ON d.id = a.document_id
		    ORDER BY a.acknowledged_at DESC LIMIT 20)
		  UNION ALL
		  (SELECT 'edit', d.id::text, COALESCE(d.company_name,''), COALESCE(d.work_order,''),
		          u.id::text, u.full_name, u.avatar_path, a.created_at
		     FROM audit_logs a
		     JOIN documents d ON d.id::text = a.target_id
		     LEFT JOIN users u ON u.id = a.actor_user_id
		    WHERE a.action = 'UPDATE' AND a.target_type = 'Document'
		    ORDER BY a.created_at DESC LIMIT 20)
		) t
		ORDER BY ts DESC LIMIT 20`)
	if err == nil {
		for actRows.Next() {
			var a activityItem
			if err := actRows.Scan(&a.Kind, &a.DocumentID, &a.CompanyName, &a.WorkOrder,
				&a.ActorID, &a.ActorName, &a.ActorAvatar, &a.At); err == nil {
				activity = append(activity, a)
			}
		}
		actRows.Close()
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

	// Same single-scan shape as Get's 7-day query — critical here since the span
	// can be up to 366 days (the correlated version rescanned documents per day).
	daily := []dailyCount{}
	rows, err := h.DB.Query(ctx, `
		WITH days AS (
		  SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS d
		), counts AS (
		  SELECT created_at::date AS d, COUNT(*) AS n
		    FROM documents
		   WHERE created_at >= $1::date AND created_at < $2::date + INTERVAL '1 day'
		   GROUP BY 1
		)
		SELECT to_char(days.d, 'YYYY-MM-DD'), COALESCE(counts.n, 0)
		  FROM days LEFT JOIN counts ON counts.d = days.d
		 ORDER BY days.d`,
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
