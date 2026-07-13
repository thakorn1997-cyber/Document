package models

import "time"

type Role string

const (
	RoleUploader  Role = "Uploader"
	RoleReceiver  Role = "Receiver"
	RoleDeptAdmin Role = "DepartmentAdmin"
	RoleSysAdmin  Role = "SystemAdmin"
)

type DocumentStatus string

const (
	StatusDraft        DocumentStatus = "Draft"
	StatusUploaded     DocumentStatus = "Uploaded"
	StatusSent         DocumentStatus = "Sent"
	StatusDownloaded   DocumentStatus = "Downloaded"
	StatusAcknowledged DocumentStatus = "Acknowledged"
	StatusReplaced     DocumentStatus = "Replaced"
	StatusArchived     DocumentStatus = "Archived"
)

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	FullName     string    `json:"full_name"`
	EmployeeID   *string   `json:"employee_id,omitempty"`
	AvatarPath   *string   `json:"avatar_path,omitempty"`
	PositionID   *string   `json:"position_id,omitempty"`
	Position     *Position `json:"position,omitempty"`
	PasswordHash string    `json:"-"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`

	Roles       []Role       `json:"roles,omitempty"`
	Departments []Department `json:"departments,omitempty"`
}

type Department struct {
	ID       string `json:"id"`
	Code     string `json:"code"`
	NameTH   string `json:"name_th"`
	NameEN   string `json:"name_en"`
	IsActive bool   `json:"is_active"`
}

type Position struct {
	ID       string `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

type Staff struct {
	ID           string      `json:"id"`
	EmployeeID   string      `json:"employee_id"`
	FullName     string      `json:"full_name"`
	DepartmentID *string     `json:"department_id,omitempty"`
	PositionID   *string     `json:"position_id,omitempty"`
	Department   *Department `json:"department,omitempty"`
	Position     *Position   `json:"position,omitempty"`
	IsActive     bool        `json:"is_active"`
	CreatedAt    time.Time   `json:"created_at"`
}

type DocumentType struct {
	ID                 string   `json:"id"`
	Code               string   `json:"code"`
	Name               string   `json:"name"`
	RequireAcknowledge bool     `json:"require_acknowledge"`
	AllowedMimeTypes   []string `json:"allowed_mime_types"`
	MaxFileSizeMB      int      `json:"max_file_size_mb"`
}

type Document struct {
	ID                 string         `json:"id"`
	Code               string         `json:"code"`
	Title              string         `json:"title"`
	DocumentTypeID     string         `json:"document_type_id"`
	SourceDepartmentID string         `json:"source_department_id"`
	OwnerUserID        string         `json:"owner_user_id"`
	Status             DocumentStatus `json:"status"`
	CurrentVersionNo   int            `json:"current_version_no"`
	DueDate            *time.Time     `json:"due_date,omitempty"`
	Note               string         `json:"note,omitempty"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`

	CompanyName         string     `json:"company_name,omitempty"`
	WorkOrder           string     `json:"work_order,omitempty"`
	OwnerProjectUserID  *string    `json:"owner_project_user_id,omitempty"`
	OwnerProjectStaffID *string    `json:"owner_project_staff_id,omitempty"`
	InstallDate         *time.Time `json:"install_date,omitempty"`
	UATStatus           string     `json:"uat_status,omitempty"`
	UATDate             *time.Time `json:"uat_date,omitempty"`
	UAIStatus           string     `json:"uai_status,omitempty"`
	UAIDate             *time.Time `json:"uai_date,omitempty"`
	CurrentUATVersionNo int        `json:"current_uat_version_no"`
	CurrentUAIVersionNo int        `json:"current_uai_version_no"`
}

type DocumentVersion struct {
	ID               string    `json:"id"`
	DocumentID       string    `json:"document_id"`
	VersionNo        int       `json:"version_no"`
	Kind             string    `json:"kind"`
	OriginalFileName string    `json:"original_file_name"`
	StoredFileName   string    `json:"stored_file_name"`
	FilePath         string    `json:"-"`
	FileSizeBytes    int64     `json:"file_size_bytes"`
	MimeType         string    `json:"mime_type"`
	SHA256           string    `json:"sha256"`
	UploadedBy       string    `json:"uploaded_by"`
	UploadedAt       time.Time `json:"uploaded_at"`
}

type DocumentRecipient struct {
	ID                 string     `json:"id"`
	DocumentID         string     `json:"document_id"`
	TargetDepartmentID string     `json:"target_department_id"`
	ReceivedStatus     string     `json:"received_status"`
	FirstDownloadedAt  *time.Time `json:"first_downloaded_at,omitempty"`
	AcknowledgedAt     *time.Time `json:"acknowledged_at,omitempty"`
	AcknowledgedBy     *string    `json:"acknowledged_by,omitempty"`
}

type DownloadLog struct {
	ID                     string    `json:"id"`
	DocumentID             string    `json:"document_id"`
	VersionID              string    `json:"version_id"`
	DownloadedBy           string    `json:"downloaded_by"`
	DownloadedDepartmentID string    `json:"downloaded_department_id"`
	DownloadedAt           time.Time `json:"downloaded_at"`
	IPAddress              string    `json:"ip_address,omitempty"`
	UserAgent              string    `json:"user_agent,omitempty"`
}

type Acknowledgement struct {
	ID             string    `json:"id"`
	DocumentID     string    `json:"document_id"`
	VersionID      string    `json:"version_id"`
	DepartmentID   string    `json:"department_id"`
	UserID         string    `json:"user_id"`
	AcknowledgedAt time.Time `json:"acknowledged_at"`
}

type AuditLog struct {
	ID          string    `json:"id"`
	ActorUserID string    `json:"actor_user_id"`
	Action      string    `json:"action"`
	TargetType  string    `json:"target_type"`
	TargetID    string    `json:"target_id"`
	Detail      any       `json:"detail,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}
