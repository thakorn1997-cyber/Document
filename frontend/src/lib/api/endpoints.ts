import { api } from "./client";

export type Position = { id: string; code: string; name: string; is_active: boolean };

export type User = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  employee_id?: string | null;
  avatar_path?: string | null;
  position_id?: string | null;
  position?: Position | null;
  roles?: string[];
  departments?: { id: string; code: string; name_th: string; name_en: string }[];
};

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  employee_id?: string | null;
  position_id?: string | null;
  position?: Position | null;
  avatar_path?: string | null;
  is_active: boolean;
  created_at: string;
  roles: string[];
  departments: { id: string; code: string; name_th: string; name_en: string }[];
};

export type UserPatch = {
  full_name?: string;
  employee_id?: string;
  position_id?: string; // empty string clears
  is_active?: boolean;
  is_admin?: boolean;
  roles?: string[];
  department_ids?: string[];
};

export type DepartmentUpsert = {
  code: string;
  name_th: string;
  name_en?: string;
  is_active?: boolean;
};

export type PositionUpsert = {
  code: string;
  name: string;
  is_active?: boolean;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: User;
};

export type AzureConfig = { enabled: boolean; tenant_id: string; client_id: string };

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ data: LoginResponse }>("/auth/login", { username, password }).then((r) => r.data.data),
  me: () => api.get<{ data: User }>("/auth/me").then((r) => r.data.data),
  logout: (refresh_token: string) => api.post("/auth/logout", { refresh_token }),
  azureConfig: () => api.get<{ data: AzureConfig }>("/auth/azure/config").then((r) => r.data.data),
  azureExchange: (id_token: string) =>
    api.post<{ data: LoginResponse }>("/auth/azure/exchange", { id_token }).then((r) => r.data.data),
  methods: () => api.get<{ data: AuthMethods }>("/auth/methods").then((r) => r.data.data),
};

export type DocumentSummary = {
  id: string;
  code: string;
  title: string;
  status: string;
  current_version_no: number;
  company_name?: string;
  work_order?: string;
  install_date?: string | null;
  uat_status?: string;
  uat_date?: string | null;
  uai_status?: string;
  uai_date?: string | null;
  created_at: string;
  owner_project_name?: string | null;
  owner_user_name?: string;
  uat_version_id?: string | null;
  uat_original_name?: string | null;
  uai_version_id?: string | null;
  uai_original_name?: string | null;
  project_type?: string;
  files_count?: number;
  files?: { id: string; name: string; kind: string }[];
  ack_count: number;
  acknowledged_by_me: boolean;
  acknowledged_by_name?: string | null;
  acknowledged_at?: string | null;
};

export type AckEntry = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_path?: string | null;
  department_code?: string | null;
  department_name?: string | null;
  version_kind: string;
  version_no: number;
  acknowledged_at: string;
};

export type UserLite = { id: string; username: string; email: string; full_name: string };

export type Department = { id: string; code: string; name_th: string; name_en: string; is_active: boolean };
export type DocumentType = {
  id: string;
  code: string;
  name: string;
  require_acknowledge: boolean;
  allowed_mime_types: string[];
  max_file_size_mb: number;
};

export type DocumentVersion = {
  id: string;
  version_no: number;
  kind: string;
  original_file_name: string;
  file_size_bytes: number;
  mime_type: string;
  uploaded_at: string;
};

export type DocumentRecipient = {
  id: string;
  target_department_id: string;
  department_code: string;
  department_name: string;
  received_status: string;
  first_downloaded_at?: string | null;
  acknowledged_at?: string | null;
};

export type DocumentDetail = {
  acknowledgements: AckEntry[];
  acknowledged_by_me: boolean;
  owner_project_name?: string | null;
  owner_project_email?: string | null;
  document: {
    id: string;
    code: string;
    title: string;
    status: string;
    current_version_no: number;
    current_uat_version_no: number;
    current_uai_version_no: number;
    source_department_id: string;
    document_type_id: string;
    note?: string;
    due_date?: string | null;
    company_name?: string;
    work_order?: string;
    owner_project_user_id?: string | null;
    owner_project_staff_id?: string | null;
    install_date?: string | null;
    uat_status?: string;
    uat_date?: string | null;
    uai_status?: string;
    uai_date?: string | null;
    created_at: string;
  };
  project_type?: string;
  versions: DocumentVersion[];
  recipients: DocumentRecipient[];
};

export type DocumentUpdate = {
  company_name?: string;
  work_order?: string;
  project_type?: string;
  owner_project_staff_id?: string;
  install_date?: string;
  uat_status?: string;
  uat_date?: string;
  uai_status?: string;
  uai_date?: string;
  note?: string;
};

export const documentApi = {
  list: (params?: Record<string, string | number>) =>
    api
      .get<{ data: DocumentSummary[]; meta: { total: number; page: number; size: number } }>("/documents", { params })
      .then((r) => r.data),
  detail: (id: string) => api.get<{ data: DocumentDetail }>(`/documents/${id}`).then((r) => r.data.data),
  create: (form: FormData) =>
    api.post("/documents", form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data.data),
  update: (id: string, patch: DocumentUpdate) =>
    api.patch(`/documents/${id}`, patch).then((r) => r.data),
  remove: (id: string) => api.delete(`/documents/${id}`).then((r) => r.data),
  addFiles: (id: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return api
      .post(`/documents/${id}/versions`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  deleteVersion: (id: string, versionId: string) =>
    api.delete(`/documents/${id}/versions/${versionId}`).then((r) => r.data),
  acknowledge: (id: string) => api.post(`/documents/${id}/acknowledge`).then((r) => r.data.data),
  unacknowledge: (id: string) => api.delete(`/documents/${id}/acknowledge`).then((r) => r.data.data),
  // Route downloads through axios so the 401→refresh→retry interceptor applies
  // (a raw fetch with a manual Bearer header silently fails when the token just expired).
  // Override the instance's 30s timeout — file downloads (≤10MB) can be slower than API calls.
  download: (id: string, versionId: string) =>
    api
      .get<Blob>(`/documents/${id}/versions/${versionId}/download`, {
        responseType: "blob",
        timeout: 60_000,
      })
      .then((r) => r.data),
};

export type LoginMethodsSetting = {
  local_enabled?: boolean;
  azure_enabled?: boolean;
  azure_tenant_id?: string;
  azure_client_id?: string;
};

export type AuthMethods = {
  local_enabled: boolean;
  azure: { enabled: boolean; tenant_id: string; client_id: string };
};

export type ReportAgingSetting = {
  warn_days?: number;
  late_days?: number;
};

export type AppSettings = {
  menu_visibility?: { dashboard?: boolean; document?: boolean; report?: boolean };
  login_methods?: LoginMethodsSetting;
  report_aging?: ReportAgingSetting;
  [key: string]: unknown;
};

export const settingsApi = {
  get: () => api.get<{ data: AppSettings }>("/settings").then((r) => r.data.data),
  patch: (patch: Partial<AppSettings>) =>
    api.patch<{ data: AppSettings }>("/settings", patch).then((r) => r.data.data),
};

export const masterApi = {
  departments: () => api.get<{ data: Department[] }>("/departments").then((r) => r.data.data),
  documentTypes: () => api.get<{ data: DocumentType[] }>("/document-types").then((r) => r.data.data),
  users: (q?: string) =>
    api.get<{ data: UserLite[] }>("/users", { params: q ? { q } : {} }).then((r) => r.data.data),
};

export const userAdminApi = {
  list: () => api.get<{ data: AdminUser[] }>("/admin/users").then((r) => r.data.data),
  patch: (id: string, patch: UserPatch) =>
    api.patch(`/admin/users/${id}`, patch).then((r) => r.data),
  delete: (id: string) => api.delete(`/admin/users/${id}`).then((r) => r.data),
};

/** Base URL for absolute-ish links. Same-origin + basePath so /uploads/* also gets proxied. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function resolveApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${BASE_PATH}/api/v1`;
  }
  return "http://localhost:8080/api/v1";
}
export const API_BASE = resolveApiBase();
// SERVER_ORIGIN keeps the basePath so uploads (proxied through Next.js) resolve correctly.
export const SERVER_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");

export function avatarUrl(path?: string | null): string | null {
  if (!path) return null;
  return `${SERVER_ORIGIN}/uploads/avatars/${path}`;
}

export type NotificationKind = "document_created" | "document_acknowledged" | "document_passed";

export type NotificationItem = {
  id: string;
  kind: NotificationKind | string;
  document_id?: string | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  payload: {
    company_name?: string;
    work_order?: string;
    title?: string;
    has_uat?: boolean;
    has_uai?: boolean;
    uat_status?: string;
    uai_status?: string;
    [k: string]: unknown;
  };
  read_at?: string | null;
  created_at: string;
};

export type DashboardData = {
  total: number;
  mine: number;
  pending_ack: number;
  acked_today: number;
  trend_pct: number;
  trend_is_new: boolean;
  this_week: number;
  daily: { date: string; count: number }[];
  statuses: {
    uat: { pending: number; passed: number; failed: number };
    uai: { pending: number; passed: number; failed: number };
  };
  activity: {
    kind: "upload" | "acknowledge" | "edit";
    document_id: string;
    company_name: string;
    work_order: string;
    actor_id?: string | null;
    actor_name?: string | null;
    actor_avatar?: string | null;
    at: string;
  }[];
};

export const dashboardApi = {
  get: () => api.get<{ data: DashboardData }>("/dashboard").then((r) => r.data.data),
  daily: (from: string, to: string) =>
    api
      .get<{ data: { date: string; count: number }[] }>("/dashboard/daily", { params: { from, to } })
      .then((r) => r.data.data),
};

export const notificationApi = {
  list: (unreadOnly = false, limit = 20) =>
    api
      .get<{ data: NotificationItem[] }>("/notifications", {
        params: { unread_only: unreadOnly ? "true" : undefined, limit },
      })
      .then((r) => r.data.data),
  unreadCount: () =>
    api.get<{ data: { count: number } }>("/notifications/unread-count").then((r) => r.data.data.count),
  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post("/notifications/read-all").then((r) => r.data),
  streamUrl: (accessToken: string) => {
    const base = SERVER_ORIGIN;
    return `${base}/api/v1/notifications/stream?access_token=${encodeURIComponent(accessToken)}`;
  },
};

export const avatarApi = {
  upload: (userId: string, file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    return api
      .post<{ data: { avatar_path: string } }>(`/users/${userId}/avatar`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.data);
  },
  remove: (userId: string) =>
    api.delete(`/users/${userId}/avatar`).then((r) => r.data),
};

export type Staff = {
  id: string;
  employee_id: string;
  full_name: string;
  department_id?: string | null;
  position_id?: string | null;
  department?: Department | null;
  position?: Position | null;
  is_active: boolean;
  created_at: string;
};

export type StaffUpsert = {
  employee_id: string;
  full_name: string;
  department_id?: string;
  position_id?: string;
  is_active?: boolean;
};

export const staffApi = {
  list: () => api.get<{ data: Staff[] }>("/staff").then((r) => r.data.data),
  listAll: () => api.get<{ data: Staff[] }>("/admin/staff").then((r) => r.data.data),
  create: (s: StaffUpsert) => api.post("/admin/staff", s).then((r) => r.data.data),
  update: (id: string, s: StaffUpsert) =>
    api.patch(`/admin/staff/${id}`, s).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/admin/staff/${id}`).then((r) => r.data.data),
};

export type Company = { id: string; name: string; work_order: string; is_active: boolean; created_at: string };
export type CompanyUpsert = { name: string; work_order?: string; is_active?: boolean };

export const companyApi = {
  list: () => api.get<{ data: Company[] }>("/companies").then((r) => r.data.data),
  listAll: () => api.get<{ data: Company[] }>("/admin/companies").then((r) => r.data.data),
  create: (c: CompanyUpsert) => api.post("/admin/companies", c).then((r) => r.data.data),
  update: (id: string, c: CompanyUpsert) =>
    api.patch(`/admin/companies/${id}`, c).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/admin/companies/${id}`).then((r) => r.data.data),
};

export const positionApi = {
  list: () => api.get<{ data: Position[] }>("/positions").then((r) => r.data.data),
  listAll: () => api.get<{ data: Position[] }>("/admin/positions").then((r) => r.data.data),
  create: (p: PositionUpsert) => api.post("/admin/positions", p).then((r) => r.data.data),
  update: (id: string, p: PositionUpsert) =>
    api.patch(`/admin/positions/${id}`, p).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/admin/positions/${id}`).then((r) => r.data.data),
};

export const departmentAdminApi = {
  listAll: () => api.get<{ data: Department[] }>("/admin/departments").then((r) => r.data.data),
  create: (d: DepartmentUpsert) => api.post("/admin/departments", d).then((r) => r.data.data),
  update: (id: string, d: DepartmentUpsert) =>
    api.patch(`/admin/departments/${id}`, d).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/admin/departments/${id}`).then((r) => r.data.data),
};
