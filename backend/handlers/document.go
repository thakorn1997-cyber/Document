package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"project-document/backend/config"
	"project-document/backend/middleware"
	"project-document/backend/models"
	"project-document/backend/notify"
	"project-document/backend/storage"
)

type DocumentHandler struct {
	Cfg     *config.Config
	DB      *pgxpool.Pool
	Storage storage.Storage
	Hub     *notify.Hub
}

func NewDocumentHandler(cfg *config.Config, db *pgxpool.Pool, s storage.Storage, hub *notify.Hub) *DocumentHandler {
	return &DocumentHandler{Cfg: cfg, DB: db, Storage: s, Hub: hub}
}

func parseDatePtr(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

func normStatus(s string) string {
	s = strings.TrimSpace(s)
	switch strings.ToLower(s) {
	case "passed":
		return "Passed"
	case "failed":
		return "Failed"
	case "pending", "":
		return "Pending"
	// legacy — old Standard/Modify/Add-on values fall back to Pending
	case "standard", "modify", "add-on", "addon":
		return "Pending"
	default:
		return "Pending"
	}
}

// normStatusPtr normalizes a status to Pending/Passed/Failed, or nil when the
// status was not chosen (empty / unrecognized) so the column stays NULL ("—").
func normStatusPtr(s string) *string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "passed":
		v := "Passed"
		return &v
	case "failed":
		v := "Failed"
		return &v
	case "pending":
		v := "Pending"
		return &v
	default:
		return nil
	}
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func normProjectType(s string) string {
	s = strings.TrimSpace(s)
	switch strings.ToLower(s) {
	case "modify", "mod":
		return "Modify"
	case "add-on", "addon", "add on":
		return "Add-on"
	default:
		return "Standard"
	}
}

func (h *DocumentHandler) Create(c *gin.Context) {
	userID := c.GetString(middleware.CtxUserID)

	title := strings.TrimSpace(c.PostForm("title"))
	docTypeID := c.PostForm("document_type_id")
	sourceDeptID := c.PostForm("source_department_id")
	note := c.PostForm("note")
	targetsCSV := c.PostForm("target_department_ids")

	companyName := strings.TrimSpace(c.PostForm("company_name"))
	workOrder := strings.TrimSpace(c.PostForm("work_order"))
	// Legacy: owner_project_user_id (kept for backward compat but not used going forward)
	ownerProjectUserID := strings.TrimSpace(c.PostForm("owner_project_user_id"))
	ownerProjectStaffID := strings.TrimSpace(c.PostForm("owner_project_staff_id"))
	installDate := parseDatePtr(c.PostForm("install_date"))
	uatStatus := normStatusPtr(c.PostForm("uat_status"))
	uatDate := parseDatePtr(c.PostForm("uat_date"))
	uaiStatus := normStatusPtr(c.PostForm("uai_status"))
	uaiDate := parseDatePtr(c.PostForm("uai_date"))
	projectType := normProjectType(c.PostForm("project_type"))

	if ownerProjectStaffID == "" {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"owner_project_staff_id (ผู้รับผิดชอบ) required")
		return
	}

	if title == "" && companyName != "" && workOrder != "" {
		title = fmt.Sprintf("%s - WO %s", companyName, workOrder)
	}
	if title == "" {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"company_name and work_order (or title) required")
		return
	}

	ctxPre := c.Request.Context()

	// Auto-default: pick first active document type if not provided
	if docTypeID == "" {
		_ = h.DB.QueryRow(ctxPre,
			`SELECT id FROM document_types WHERE is_active = TRUE ORDER BY code LIMIT 1`,
		).Scan(&docTypeID)
	}
	if docTypeID == "" {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"no active document_type available; admin must create one first")
		return
	}

	// Auto-default: source_department = user's first department
	if sourceDeptID == "" {
		if deptIDs := middleware.UserDeptIDs(c); len(deptIDs) > 0 {
			sourceDeptID = deptIDs[0]
		}
	}
	if sourceDeptID == "" {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"user has no department; admin must assign one first")
		return
	}

	// Recipients concept removed — documents are global.
	// If caller explicitly passes target_department_ids (legacy clients), we honor it.
	targets := []string{}
	if targetsCSV != "" {
		for _, t := range strings.Split(targetsCSV, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				targets = append(targets, t)
			}
		}
	}

	// Multi-file upload: unified `files[]` (new) + backward-compat legacy fields
	form, _ := c.MultipartForm()
	var multiFiles []*multipart.FileHeader
	if form != nil {
		multiFiles = form.File["files"]
	}
	uatFile, _ := c.FormFile("file_uat") // legacy
	uaiFile, _ := c.FormFile("file_uai") // legacy
	legacyFile, _ := c.FormFile("file")  // legacy

	// Files are optional — a document can be saved without any attachment.
	for _, fh := range multiFiles {
		if !h.validateUpload(c, fh) {
			return
		}
	}
	for _, fh := range []*multipart.FileHeader{uatFile, uaiFile, legacyFile} {
		if fh != nil && !h.validateUpload(c, fh) {
			return
		}
	}

	ctx := c.Request.Context()
	tx, err := h.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	docID := uuid.NewString()
	docCode := fmt.Sprintf("DOC-%s-%s", time.Now().Format("2006"), docID[:8])

	var ownerProjectUser *string
	if ownerProjectUserID != "" {
		ownerProjectUser = &ownerProjectUserID
	}
	var ownerProjectStaff *string
	if ownerProjectStaffID != "" {
		ownerProjectStaff = &ownerProjectStaffID
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO documents (
		    id, code, title, document_type_id, source_department_id,
		    owner_user_id, status, current_version_no, note,
		    company_name, work_order, owner_project_user_id, owner_project_staff_id,
		    install_date, uat_status, uat_date, uai_status, uai_date, project_type
		) VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
		docID, docCode, title, docTypeID, sourceDeptID,
		userID, models.StatusSent, note,
		nilIfEmpty(companyName), nilIfEmpty(workOrder), ownerProjectUser, ownerProjectStaff,
		installDate, uatStatus, uatDate, uaiStatus, uaiDate, projectType,
	)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	for _, targetID := range targets {
		_, err = tx.Exec(ctx,
			`INSERT INTO document_recipients (id, document_id, target_department_id, received_status)
			 VALUES ($1, $2, $3, 'PendingDownload')
			 ON CONFLICT (document_id, target_department_id) DO NOTHING`,
			uuid.NewString(), docID, targetID)
		if err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
	}

	savedPaths := []string{}
	// version_no runs per (document, kind) so multiple files of the same kind
	// (e.g. several ATTACHMENT files) don't collide on uq_document_versions_kind.
	verCounter := map[string]int{}
	saveOne := func(fh *multipart.FileHeader, kind string) error {
		verCounter[kind]++
		rel, err := h.storeVersion(ctx, tx, docID, userID, kind, verCounter[kind], fh)
		if rel != "" {
			savedPaths = append(savedPaths, rel)
		}
		return err
	}

	currentUAT, currentUAI, currentMain := 0, 0, 0
	// Save unified files[] as ATTACHMENT kind
	attachCount := 0
	for _, fh := range multiFiles {
		if err := saveOne(fh, "ATTACHMENT"); err != nil {
			for _, p := range savedPaths {
				_ = h.Storage.Delete(p)
			}
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		attachCount++
	}
	// Legacy fields
	if uatFile != nil {
		if err := saveOne(uatFile, "UAT"); err != nil {
			for _, p := range savedPaths {
				_ = h.Storage.Delete(p)
			}
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		currentUAT = 1
	}
	if uaiFile != nil {
		if err := saveOne(uaiFile, "UAI"); err != nil {
			for _, p := range savedPaths {
				_ = h.Storage.Delete(p)
			}
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		currentUAI = 1
	}
	if legacyFile != nil {
		if err := saveOne(legacyFile, "MAIN"); err != nil {
			for _, p := range savedPaths {
				_ = h.Storage.Delete(p)
			}
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		currentMain = 1
	}
	_, err = tx.Exec(ctx, `
		UPDATE documents
		   SET current_uat_version_no = $2,
		       current_uai_version_no = $3,
		       current_version_no     = GREATEST(current_version_no, $4)
		 WHERE id = $1`, docID, currentUAT, currentUAI, attachCount+currentMain+currentUAT+currentUAI)
	if err != nil {
		for _, p := range savedPaths {
			_ = h.Storage.Delete(p)
		}
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	writeAudit(ctx, tx, userID, "UPLOAD", "Document", docID,
		gin.H{"attachments": attachCount, "uat": currentUAT, "uai": currentUAI, "main": currentMain})

	if err := tx.Commit(ctx); err != nil {
		for _, p := range savedPaths {
			_ = h.Storage.Delete(p)
		}
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// Notify everyone only when a UAT/UAI status is Passed on save.
	if derefStr(uatStatus) == "Passed" || derefStr(uaiStatus) == "Passed" {
		go FanoutPassed(h.DB, h.Hub, docID, userID, map[string]any{
			"company_name": companyName,
			"work_order":   workOrder,
			"title":        title,
			"uat_status":   derefStr(uatStatus),
			"uai_status":   derefStr(uaiStatus),
		})
	}

	Created(c, gin.H{"id": docID, "code": docCode})
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

type documentListItem struct {
	ID               string     `json:"id"`
	Code             string     `json:"code"`
	Title            string     `json:"title"`
	Status           string     `json:"status"`
	CurrentVersionNo int        `json:"current_version_no"`
	CompanyName      string     `json:"company_name,omitempty"`
	WorkOrder        string     `json:"work_order,omitempty"`
	InstallDate      *time.Time `json:"install_date,omitempty"`
	UATStatus        string     `json:"uat_status,omitempty"`
	UATDate          *time.Time `json:"uat_date,omitempty"`
	UAIStatus        string     `json:"uai_status,omitempty"`
	UAIDate          *time.Time `json:"uai_date,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`

	OwnerProjectName *string `json:"owner_project_name,omitempty"`
	OwnerUserName    string  `json:"owner_user_name,omitempty"`

	UATVersionID    *string `json:"uat_version_id,omitempty"`
	UATOriginalName *string `json:"uat_original_name,omitempty"`
	UAIVersionID    *string `json:"uai_version_id,omitempty"`
	UAIOriginalName *string `json:"uai_original_name,omitempty"`

	ProjectType string      `json:"project_type,omitempty"`
	FilesCount  int         `json:"files_count"`
	Files       []fileLite  `json:"files"`

	AckCount           int        `json:"ack_count"`
	AcknowledgedByMe   bool       `json:"acknowledged_by_me"`
	AcknowledgedByName *string    `json:"acknowledged_by_name,omitempty"`
	AcknowledgedAt     *time.Time `json:"acknowledged_at,omitempty"`
}

type fileLite struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Kind string `json:"kind"`
}

// List returns ALL documents (global — everyone sees all).
// No direction/department filter; recipients concept was removed.
func (h *DocumentHandler) List(c *gin.Context) {
	page, size := parsePaging(c)
	offset := (page - 1) * size
	ctx := c.Request.Context()
	userID := c.GetString(middleware.CtxUserID)

	var total int64
	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM documents`).Scan(&total); err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT d.id, d.code, d.title, d.status, d.current_version_no,
		       COALESCE(d.company_name,''), COALESCE(d.work_order,''),
		       d.install_date, COALESCE(d.uat_status,''), d.uat_date,
		       COALESCE(d.uai_status,''), d.uai_date,
		       d.created_at,
		       sm.full_name AS owner_project_name,
		       ou.full_name AS owner_user_name,
		       uat.id::text AS uat_version_id, uat.original_file_name AS uat_original_name,
		       uai.id::text AS uai_version_id, uai.original_file_name AS uai_original_name,
		       COALESCE(d.project_type, 'Standard'),
		       (SELECT COUNT(*) FROM document_versions WHERE document_id = d.id) AS files_count,
		       (SELECT COALESCE(json_agg(json_build_object(
		                   'id', v.id::text, 'name', v.original_file_name, 'kind', v.kind)
		                 ORDER BY v.uploaded_at), '[]'::json)
		          FROM document_versions v WHERE v.document_id = d.id) AS files,
		       (SELECT COUNT(*) FROM acknowledgements WHERE document_id = d.id) AS ack_count,
		       EXISTS (SELECT 1 FROM acknowledgements
		                WHERE document_id = d.id AND user_id = $3) AS acknowledged_by_me,
		       (SELECT u.full_name FROM acknowledgements a
		          JOIN users u ON u.id = a.user_id
		         WHERE a.document_id = d.id LIMIT 1) AS acknowledged_by_name,
		       (SELECT a.acknowledged_at FROM acknowledgements a
		         WHERE a.document_id = d.id LIMIT 1) AS acknowledged_at
		  FROM documents d
		  LEFT JOIN staff_master sm ON sm.id = d.owner_project_staff_id
		  LEFT JOIN users ou ON ou.id = d.owner_user_id
		  LEFT JOIN LATERAL (
		      SELECT id, original_file_name
		        FROM document_versions
		       WHERE document_id = d.id AND kind = 'UAT'
		       ORDER BY version_no DESC LIMIT 1
		  ) uat ON TRUE
		  LEFT JOIN LATERAL (
		      SELECT id, original_file_name
		        FROM document_versions
		       WHERE document_id = d.id AND kind = 'UAI'
		       ORDER BY version_no DESC LIMIT 1
		  ) uai ON TRUE
		 ORDER BY d.created_at DESC
		 LIMIT $1 OFFSET $2`, size, offset, userID,
	)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rows.Close()

	items := []documentListItem{}
	for rows.Next() {
		var it documentListItem
		var ownerUserName *string
		var filesJSON []byte
		if err := rows.Scan(&it.ID, &it.Code, &it.Title, &it.Status, &it.CurrentVersionNo,
			&it.CompanyName, &it.WorkOrder,
			&it.InstallDate, &it.UATStatus, &it.UATDate, &it.UAIStatus, &it.UAIDate,
			&it.CreatedAt,
			&it.OwnerProjectName, &ownerUserName,
			&it.UATVersionID, &it.UATOriginalName,
			&it.UAIVersionID, &it.UAIOriginalName,
			&it.ProjectType, &it.FilesCount, &filesJSON,
			&it.AckCount, &it.AcknowledgedByMe,
			&it.AcknowledgedByName, &it.AcknowledgedAt,
		); err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		if ownerUserName != nil {
			it.OwnerUserName = *ownerUserName
		}
		it.Files = []fileLite{}
		if len(filesJSON) > 0 {
			_ = json.Unmarshal(filesJSON, &it.Files)
		}
		items = append(items, it)
	}

	List(c, items, Meta{Page: page, Size: size, Total: total})
}

type documentDetail struct {
	Document         models.Document          `json:"document"`
	Versions         []models.DocumentVersion `json:"versions"`
	Recipients       []recipientWithDept      `json:"recipients"` // legacy — usually empty now
	Acknowledgements []ackEntry               `json:"acknowledgements"`
	AcknowledgedByMe bool                     `json:"acknowledged_by_me"`

	ProjectType       string  `json:"project_type"`
	OwnerProjectName  *string `json:"owner_project_name,omitempty"`
	OwnerProjectEmail *string `json:"owner_project_email,omitempty"`
	OwnerProjectEmpID *string `json:"owner_project_employee_id,omitempty"`
}

type recipientWithDept struct {
	models.DocumentRecipient
	DepartmentCode string `json:"department_code"`
	DepartmentName string `json:"department_name"`
}

type ackEntry struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	FullName        string     `json:"full_name"`
	Email           string     `json:"email"`
	AvatarPath      *string    `json:"avatar_path,omitempty"`
	DepartmentCode  *string    `json:"department_code,omitempty"`
	DepartmentName  *string    `json:"department_name,omitempty"`
	VersionKind     string     `json:"version_kind"`
	VersionNo       int        `json:"version_no"`
	AcknowledgedAt  time.Time  `json:"acknowledged_at"`
}

func (h *DocumentHandler) Detail(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()

	var d models.Document
	var ownerProjectName, ownerProjectEmpID *string
	var projectType string
	err := h.DB.QueryRow(ctx, `
		SELECT d.id, d.code, d.title, d.document_type_id, d.source_department_id, d.owner_user_id,
		       d.status, d.current_version_no, d.due_date, COALESCE(d.note,''),
		       d.created_at, d.updated_at,
		       COALESCE(d.company_name,''), COALESCE(d.work_order,''), d.owner_project_user_id,
		       d.owner_project_staff_id,
		       d.install_date, COALESCE(d.uat_status,''), d.uat_date,
		       COALESCE(d.uai_status,''), d.uai_date,
		       d.current_uat_version_no, d.current_uai_version_no,
		       s.full_name, s.employee_id,
		       COALESCE(d.project_type, 'Standard')
		  FROM documents d
		  LEFT JOIN staff_master s ON s.id = d.owner_project_staff_id
		 WHERE d.id = $1`, id,
	).Scan(&d.ID, &d.Code, &d.Title, &d.DocumentTypeID, &d.SourceDepartmentID,
		&d.OwnerUserID, &d.Status, &d.CurrentVersionNo, &d.DueDate, &d.Note,
		&d.CreatedAt, &d.UpdatedAt,
		&d.CompanyName, &d.WorkOrder, &d.OwnerProjectUserID,
		&d.OwnerProjectStaffID,
		&d.InstallDate, &d.UATStatus, &d.UATDate, &d.UAIStatus, &d.UAIDate,
		&d.CurrentUATVersionNo, &d.CurrentUAIVersionNo,
		&ownerProjectName, &ownerProjectEmpID,
		&projectType)
	if err != nil {
		Err(c, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}

	versions := []models.DocumentVersion{}
	vrows, err := h.DB.Query(ctx, `
		SELECT id, document_id, version_no, kind, original_file_name, stored_file_name,
		       file_path, file_size_bytes, mime_type, sha256, uploaded_by, uploaded_at
		  FROM document_versions
		 WHERE document_id = $1
		 ORDER BY uploaded_at DESC`, id)
	if err == nil {
		defer vrows.Close()
		for vrows.Next() {
			var v models.DocumentVersion
			if err := vrows.Scan(&v.ID, &v.DocumentID, &v.VersionNo, &v.Kind, &v.OriginalFileName,
				&v.StoredFileName, &v.FilePath, &v.FileSizeBytes, &v.MimeType, &v.SHA256,
				&v.UploadedBy, &v.UploadedAt); err == nil {
				versions = append(versions, v)
			}
		}
	}

	recipients := []recipientWithDept{}
	rrows, err := h.DB.Query(ctx, `
		SELECT r.id, r.document_id, r.target_department_id, r.received_status,
		       r.first_downloaded_at, r.acknowledged_at, r.acknowledged_by,
		       d.code, d.name_th
		  FROM document_recipients r
		  JOIN departments d ON d.id = r.target_department_id
		 WHERE r.document_id = $1`, id)
	if err == nil {
		defer rrows.Close()
		for rrows.Next() {
			var r recipientWithDept
			if err := rrows.Scan(&r.ID, &r.DocumentID, &r.TargetDepartmentID, &r.ReceivedStatus,
				&r.FirstDownloadedAt, &r.AcknowledgedAt, &r.AcknowledgedBy,
				&r.DepartmentCode, &r.DepartmentName); err == nil {
				recipients = append(recipients, r)
			}
		}
	}

	// Per-user acknowledgements
	acks := []ackEntry{}
	ackedByMe := false
	callerID := c.GetString(middleware.CtxUserID)
	arows, err := h.DB.Query(ctx, `
		SELECT a.id::text, u.id::text, u.full_name, u.email, u.avatar_path,
		       d.code, d.name_th,
		       v.kind, v.version_no,
		       a.acknowledged_at
		  FROM acknowledgements a
		  JOIN users u ON u.id = a.user_id
		  LEFT JOIN departments d ON d.id = a.department_id
		  JOIN document_versions v ON v.id = a.version_id
		 WHERE a.document_id = $1
		 ORDER BY a.acknowledged_at DESC`, id)
	if err == nil {
		defer arows.Close()
		for arows.Next() {
			var a ackEntry
			if err := arows.Scan(&a.ID, &a.UserID, &a.FullName, &a.Email, &a.AvatarPath,
				&a.DepartmentCode, &a.DepartmentName,
				&a.VersionKind, &a.VersionNo,
				&a.AcknowledgedAt); err == nil {
				acks = append(acks, a)
				if a.UserID == callerID {
					ackedByMe = true
				}
			}
		}
	}

	OK(c, documentDetail{
		Document:          d,
		Versions:          versions,
		Recipients:        recipients,
		Acknowledgements:  acks,
		AcknowledgedByMe:  ackedByMe,
		ProjectType:       projectType,
		OwnerProjectName:  ownerProjectName,
		OwnerProjectEmpID: ownerProjectEmpID,
	})
}

// Acknowledge — first-come lock: only 1 person can ack per document.
// Returns 409 CONFLICT if already acknowledged by someone.
func (h *DocumentHandler) Acknowledge(c *gin.Context) {
	docID := c.Param("id")
	userID := c.GetString(middleware.CtxUserID)
	ctx := c.Request.Context()

	// Use latest version (any kind) as the acknowledged version
	var versionID string
	var versionNo int
	err := h.DB.QueryRow(ctx,
		`SELECT id, version_no FROM document_versions
		  WHERE document_id = $1 ORDER BY uploaded_at DESC LIMIT 1`, docID,
	).Scan(&versionID, &versionNo)
	if err != nil {
		Err(c, http.StatusNotFound, "NOT_FOUND", "document has no version")
		return
	}

	// User's default department (optional — stored for reporting)
	var deptID *string
	deptIDs := middleware.UserDeptIDs(c)
	if len(deptIDs) > 0 {
		deptID = &deptIDs[0]
	}

	tx, err := h.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		INSERT INTO acknowledgements (id, document_id, version_id, department_id, user_id)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (document_id) DO NOTHING`,
		uuid.NewString(), docID, versionID, deptID, userID)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		// Already locked — find who acked it
		var name string
		_ = h.DB.QueryRow(ctx, `
			SELECT u.full_name
			  FROM acknowledgements a JOIN users u ON u.id = a.user_id
			 WHERE a.document_id = $1`, docID).Scan(&name)
		Err(c, http.StatusConflict, "ALREADY_ACKNOWLEDGED",
			"เอกสารนี้มีผู้กดรับทราบแล้วโดย "+name)
		return
	}

	writeAudit(ctx, tx, userID, "ACKNOWLEDGE", "Document", docID,
		gin.H{"version": versionNo})

	if err := tx.Commit(ctx); err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// Notify uploader (async)
	var company, workOrder string
	_ = h.DB.QueryRow(ctx,
		`SELECT COALESCE(company_name,''), COALESCE(work_order,'') FROM documents WHERE id = $1`, docID).
		Scan(&company, &workOrder)
	go FanoutAcknowledged(h.DB, h.Hub, docID, userID, map[string]any{
		"company_name": company,
		"work_order":   workOrder,
	})

	OK(c, gin.H{"ok": true})
}

// Unacknowledge — disabled by policy (first-come lock, permanent).
func (h *DocumentHandler) Unacknowledge(c *gin.Context) {
	Err(c, http.StatusForbidden, "FORBIDDEN",
		"การรับทราบเป็นการล็อกถาวร ไม่สามารถยกเลิกได้")
}

type documentUpdateRequest struct {
	CompanyName         *string `json:"company_name,omitempty"`
	WorkOrder           *string `json:"work_order,omitempty"`
	ProjectType         *string `json:"project_type,omitempty"`
	OwnerProjectStaffID *string `json:"owner_project_staff_id,omitempty"`
	InstallDate         *string `json:"install_date,omitempty"`
	UATStatus           *string `json:"uat_status,omitempty"`
	UATDate             *string `json:"uat_date,omitempty"`
	UAIStatus           *string `json:"uai_status,omitempty"`
	UAIDate             *string `json:"uai_date,omitempty"`
	Note                *string `json:"note,omitempty"`
}

// Update edits document metadata (admin only). Files are not changed here.
func (h *DocumentHandler) Update(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	var req documentUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
		return
	}

	ctx := c.Request.Context()
	userID := c.GetString(middleware.CtxUserID)

	// Capture Passed state before the edit, to detect a transition into Passed.
	var oldUAT, oldUAI string
	_ = h.DB.QueryRow(ctx,
		`SELECT COALESCE(uat_status,''), COALESCE(uai_status,'') FROM documents WHERE id = $1`, id).
		Scan(&oldUAT, &oldUAI)
	oldPassed := oldUAT == "Passed" || oldUAI == "Passed"

	set := []string{}
	args := []any{}
	n := 1
	add := func(col string, val any) {
		set = append(set, fmt.Sprintf("%s = $%d", col, n))
		args = append(args, val)
		n++
	}
	if req.CompanyName != nil {
		add("company_name", nilIfEmpty(strings.TrimSpace(*req.CompanyName)))
	}
	if req.WorkOrder != nil {
		add("work_order", nilIfEmpty(strings.TrimSpace(*req.WorkOrder)))
	}
	if req.ProjectType != nil {
		add("project_type", normProjectType(*req.ProjectType))
	}
	if req.OwnerProjectStaffID != nil {
		add("owner_project_staff_id", nilIfEmpty(strings.TrimSpace(*req.OwnerProjectStaffID)))
	}
	if req.InstallDate != nil {
		add("install_date", parseDatePtr(*req.InstallDate))
	}
	if req.UATStatus != nil {
		add("uat_status", normStatusPtr(*req.UATStatus))
	}
	if req.UATDate != nil {
		add("uat_date", parseDatePtr(*req.UATDate))
	}
	if req.UAIStatus != nil {
		add("uai_status", normStatusPtr(*req.UAIStatus))
	}
	if req.UAIDate != nil {
		add("uai_date", parseDatePtr(*req.UAIDate))
	}
	if req.Note != nil {
		add("note", *req.Note)
	}

	if len(set) == 0 {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "no fields to update")
		return
	}

	tx, err := h.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	set = append(set, "updated_at = NOW()")
	query := fmt.Sprintf("UPDATE documents SET %s WHERE id = $%d", strings.Join(set, ", "), n)
	args = append(args, id)
	tag, err := tx.Exec(ctx, query, args...)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}

	// Keep title in sync with company/work order when either changed.
	if req.CompanyName != nil || req.WorkOrder != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE documents
			   SET title = company_name || ' - WO ' || work_order
			 WHERE id = $1 AND company_name IS NOT NULL AND work_order IS NOT NULL`, id); err != nil {
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
	}

	writeAudit(ctx, tx, userID, "UPDATE", "Document", id, req)

	if err := tx.Commit(ctx); err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// Notify everyone only when the edit just moved a status into Passed
	// (skip if it was already Passed before, to avoid duplicate alerts).
	var newUAT, newUAI, company, workOrder, title string
	_ = h.DB.QueryRow(ctx, `
		SELECT COALESCE(uat_status,''), COALESCE(uai_status,''),
		       COALESCE(company_name,''), COALESCE(work_order,''), title
		  FROM documents WHERE id = $1`, id).
		Scan(&newUAT, &newUAI, &company, &workOrder, &title)
	if (newUAT == "Passed" || newUAI == "Passed") && !oldPassed {
		go FanoutPassed(h.DB, h.Hub, id, userID, map[string]any{
			"company_name": company,
			"work_order":   workOrder,
			"title":        title,
			"uat_status":   newUAT,
			"uai_status":   newUAI,
		})
	}

	OK(c, gin.H{"ok": true})
}

// Delete permanently removes a document and its files (admin only).
// Child rows (versions, acknowledgements, recipients, logs, notifications)
// cascade via FK ON DELETE CASCADE; physical files are removed from storage.
func (h *DocumentHandler) Delete(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	id := c.Param("id")
	ctx := c.Request.Context()
	userID := c.GetString(middleware.CtxUserID)

	// Collect file paths before the cascade removes version rows.
	paths := []string{}
	prows, err := h.DB.Query(ctx,
		`SELECT file_path FROM document_versions WHERE document_id = $1`, id)
	if err == nil {
		for prows.Next() {
			var p string
			if prows.Scan(&p) == nil {
				paths = append(paths, p)
			}
		}
		prows.Close()
	}

	tx, err := h.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	writeAudit(ctx, tx, userID, "DELETE", "Document", id, nil)

	tag, err := tx.Exec(ctx, `DELETE FROM documents WHERE id = $1`, id)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// Remove physical files after the DB commit succeeds.
	for _, p := range paths {
		_ = h.Storage.Delete(p)
	}

	OK(c, gin.H{"ok": true, "mode": "hard_delete"})
}

// allowedDocExt is the server-side whitelist for document attachments (mirrors
// the client-side PDF/JPG/PNG rule). Enforcing it here prevents uploading
// arbitrary file types (e.g. .exe/.html/.svg) via a direct API call.
var allowedDocExt = map[string]bool{
	".pdf": true, ".jpg": true, ".jpeg": true, ".png": true,
}

// validateUpload checks size + extension for one uploaded file and writes an
// error response (returning false) if it is rejected.
func (h *DocumentHandler) validateUpload(c *gin.Context, fh *multipart.FileHeader) bool {
	if fh.Size > h.Cfg.MaxUploadMB*1024*1024 {
		Err(c, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE",
			fmt.Sprintf("file %q exceeds %d MB", fh.Filename, h.Cfg.MaxUploadMB))
		return false
	}
	if !allowedDocExt[strings.ToLower(filepath.Ext(fh.Filename))] {
		Err(c, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE",
			fmt.Sprintf("file %q: allowed types are pdf, jpg, jpeg, png", fh.Filename))
		return false
	}
	return true
}

// contentDisposition builds a safe Content-Disposition header. It strips control
// characters/quotes from the ASCII fallback and adds an RFC 5987 filename* so
// Thai/UTF-8 names survive without letting a crafted filename inject headers.
func contentDisposition(name string) string {
	ascii := strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f || r == '"' || r == '\\' || r > 0x7e {
			return -1
		}
		return r
	}, name)
	if ascii == "" {
		ascii = "download"
	}
	return fmt.Sprintf("attachment; filename=%q; filename*=UTF-8''%s", ascii, url.PathEscape(name))
}

// storeVersion streams a file to storage and inserts a document_versions row.
// Returns the stored relative path (non-empty even on insert error, so callers
// can clean up the orphaned file).
func (h *DocumentHandler) storeVersion(
	ctx context.Context, tx pgx.Tx, docID, userID, kind string, versionNo int, fh *multipart.FileHeader,
) (string, error) {
	src, err := fh.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()
	hasher := sha256.New()
	tee := io.TeeReader(src, hasher)
	ext := filepath.Ext(fh.Filename)
	stored := uuid.NewString() + ext
	rel := filepath.ToSlash(filepath.Join(time.Now().Format("2006/01"), stored))
	size, err := h.Storage.Save(rel, tee)
	if err != nil {
		return "", err
	}
	sha := hex.EncodeToString(hasher.Sum(nil))
	_, err = tx.Exec(ctx, `
		INSERT INTO document_versions (id, document_id, version_no, kind,
		                                original_file_name, stored_file_name, file_path,
		                                file_size_bytes, mime_type, sha256, uploaded_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		uuid.NewString(), docID, versionNo, kind, fh.Filename, stored, rel, size,
		fh.Header.Get("Content-Type"), sha, userID)
	return rel, err
}

// AddVersions attaches more files (kind ATTACHMENT) to an existing document (admin only).
func (h *DocumentHandler) AddVersions(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	docID := c.Param("id")
	userID := c.GetString(middleware.CtxUserID)
	ctx := c.Request.Context()

	var exists bool
	if err := h.DB.QueryRow(ctx,
		`SELECT TRUE FROM documents WHERE id = $1`, docID).Scan(&exists); err != nil {
		Err(c, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}

	form, _ := c.MultipartForm()
	var files []*multipart.FileHeader
	if form != nil {
		files = form.File["files"]
	}
	if len(files) == 0 {
		Err(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "at least one file is required")
		return
	}
	for _, fh := range files {
		if !h.validateUpload(c, fh) {
			return
		}
	}

	var maxV int
	_ = h.DB.QueryRow(ctx,
		`SELECT COALESCE(MAX(version_no), 0) FROM document_versions
		  WHERE document_id = $1 AND kind = 'ATTACHMENT'`, docID).Scan(&maxV)

	tx, err := h.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	savedPaths := []string{}
	for i, fh := range files {
		rel, err := h.storeVersion(ctx, tx, docID, userID, "ATTACHMENT", maxV+i+1, fh)
		if rel != "" {
			savedPaths = append(savedPaths, rel)
		}
		if err != nil {
			for _, p := range savedPaths {
				_ = h.Storage.Delete(p)
			}
			Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE documents SET current_version_no = current_version_no + $2, updated_at = NOW()
		  WHERE id = $1`, docID, len(files)); err != nil {
		for _, p := range savedPaths {
			_ = h.Storage.Delete(p)
		}
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	writeAudit(ctx, tx, userID, "ADD_FILES", "Document", docID, gin.H{"count": len(files)})

	if err := tx.Commit(ctx); err != nil {
		for _, p := range savedPaths {
			_ = h.Storage.Delete(p)
		}
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	OK(c, gin.H{"ok": true, "added": len(files)})
}

// DeleteVersion removes a single file/version and its stored file (admin only).
func (h *DocumentHandler) DeleteVersion(c *gin.Context) {
	if !isAdmin(c) {
		Err(c, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	docID := c.Param("id")
	versionID := c.Param("versionId")
	userID := c.GetString(middleware.CtxUserID)
	ctx := c.Request.Context()

	var path string
	if err := h.DB.QueryRow(ctx,
		`SELECT file_path FROM document_versions WHERE id = $1 AND document_id = $2`,
		versionID, docID).Scan(&path); err != nil {
		Err(c, http.StatusNotFound, "NOT_FOUND", "version not found")
		return
	}

	tx, err := h.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer tx.Rollback(ctx)

	writeAudit(ctx, tx, userID, "DELETE_FILE", "Document", docID, gin.H{"version_id": versionID})

	tag, err := tx.Exec(ctx,
		`DELETE FROM document_versions WHERE id = $1 AND document_id = $2`, versionID, docID)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		Err(c, http.StatusNotFound, "NOT_FOUND", "version not found")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	_ = h.Storage.Delete(path)
	OK(c, gin.H{"ok": true})
}

func parsePaging(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if size < 1 {
		size = 20
	}
	if size > 500 {
		size = 500
	}
	return page, size
}

func (h *DocumentHandler) Download(c *gin.Context) {
	docID := c.Param("id")
	versionID := c.Param("versionId")
	userID := c.GetString(middleware.CtxUserID)
	ctx := c.Request.Context()

	var v models.DocumentVersion
	err := h.DB.QueryRow(ctx,
		`SELECT id, document_id, version_no, original_file_name, stored_file_name,
		        file_path, file_size_bytes, mime_type, sha256, uploaded_by, uploaded_at
		   FROM document_versions WHERE id = $1 AND document_id = $2`,
		versionID, docID,
	).Scan(&v.ID, &v.DocumentID, &v.VersionNo, &v.OriginalFileName, &v.StoredFileName,
		&v.FilePath, &v.FileSizeBytes, &v.MimeType, &v.SHA256, &v.UploadedBy, &v.UploadedAt)
	if err != nil {
		Err(c, http.StatusNotFound, "NOT_FOUND", "version not found")
		return
	}

	rc, err := h.Storage.Open(v.FilePath)
	if err != nil {
		Err(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer rc.Close()

	deptIDs := middleware.UserDeptIDs(c)
	var recipientDept *string
	if len(deptIDs) > 0 {
		var d string
		if err := h.DB.QueryRow(ctx,
			`SELECT target_department_id::text FROM document_recipients
			  WHERE document_id = $1 AND target_department_id = ANY($2) LIMIT 1`,
			docID, deptIDs).Scan(&d); err == nil {
			recipientDept = &d
		}
	}

	_, _ = h.DB.Exec(ctx,
		`INSERT INTO download_logs (id, document_id, version_id, downloaded_by,
		                             downloaded_department_id, ip_address, user_agent)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		uuid.NewString(), docID, versionID, userID, recipientDept, c.ClientIP(), c.Request.UserAgent())

	if recipientDept != nil {
		_, _ = h.DB.Exec(ctx, `
			UPDATE document_recipients
			   SET received_status = 'Downloaded',
			       first_downloaded_at = COALESCE(first_downloaded_at, NOW())
			 WHERE document_id = $1 AND target_department_id = $2`, docID, *recipientDept)
		_, _ = h.DB.Exec(ctx,
			`UPDATE documents SET status = 'Downloaded', updated_at = NOW()
			  WHERE id = $1 AND status IN ('Sent', 'Uploaded')`, docID)
	}

	c.Header("Content-Disposition", contentDisposition(v.OriginalFileName))
	c.DataFromReader(http.StatusOK, v.FileSizeBytes, v.MimeType, rc, nil)
}

func writeAudit(ctx context.Context, tx pgx.Tx, userID, action, targetType, targetID string, detail any) {
	var detailJSON []byte
	if detail != nil {
		detailJSON, _ = json.Marshal(detail)
	}
	_, _ = tx.Exec(ctx,
		`INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, detail_json)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		uuid.NewString(), userID, action, targetType, targetID, detailJSON)
}
