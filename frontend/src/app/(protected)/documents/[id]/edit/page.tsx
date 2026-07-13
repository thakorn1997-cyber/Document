"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, ClipboardCheck, UploadCloud, Download, Trash2, Save } from "lucide-react";
import { documentApi, staffApi, companyApi, authApi, DocumentUpdate } from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { SearchableSelect } from "@/components/SearchableSelect";
import { cn, saveBlob } from "@/lib/utils";
import { MusicLoader } from "@/components/MusicLoader";

type StatusChoice = "Pending" | "Passed" | "Failed";
type StatusValue = StatusChoice | "";
type ProjectType = "Standard" | "Modify" | "Add-on";

const PROJECT_TYPE_OPTIONS = [
  { id: "Standard", label: "Standard" },
  { id: "Modify", label: "Modify" },
  { id: "Add-on", label: "Add-on" },
];

const MAX_FILE_MB = 10;
const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];

function isAdminRole(roles?: string[]) {
  return (roles ?? []).some((r) => r === "SystemAdmin" || r === "admin");
}

function toDateInput(v?: string | null) {
  return v ? v.slice(0, 10) : "";
}

function normStatus(v?: string): StatusValue {
  return v === "Pending" || v === "Passed" || v === "Failed" ? v : "";
}

export default function EditDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const admin = isAdminRole(meQ.data?.roles);

  const detailQ = useQuery({ queryKey: ["document", id], queryFn: () => documentApi.detail(id) });
  const staffQ = useQuery({ queryKey: ["staff"], queryFn: staffApi.list });
  const companiesQ = useQuery({ queryKey: ["companies"], queryFn: companyApi.list });
  const companyNames = (companiesQ.data ?? []).map((c) => c.name);

  const [projectType, setProjectType] = useState<ProjectType>("Standard");
  const [companyName, setCompanyName] = useState("");
  const [workOrder, setWorkOrder] = useState("");
  const [ownerStaffID, setOwnerStaffID] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [note, setNote] = useState("");
  const [uatStatus, setUatStatus] = useState<StatusValue>("");
  const [uatDate, setUatDate] = useState("");
  const [uaiStatus, setUaiStatus] = useState<StatusValue>("");
  const [uaiDate, setUaiDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Attachments
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const existingFiles = detailQ.data?.versions ?? [];

  const addFilesMut = useMutation({
    mutationFn: (files: File[]) => documentApi.addFiles(id, files),
    onSuccess: (_res, files) => {
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
      toast.success(`อัปโหลดไฟล์ ${files.length} ไฟล์เรียบร้อยแล้ว`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "อัปโหลดไฟล์ไม่สำเร็จ";
      setFileError(msg);
      toast.error(msg);
    },
  });

  function onPickFiles(picked: FileList | File[]) {
    setFileError(null);
    const valid: File[] = [];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setFileError(`ไฟล์ "${f.name}" มีขนาดเกิน ${MAX_FILE_MB} MB`);
        continue;
      }
      if (!ALLOWED_MIMES.includes(f.type)) {
        setFileError(`ไฟล์ "${f.name}" ต้องเป็น PDF, JPG หรือ PNG`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length) addFilesMut.mutate(valid);
  }

  const deleteVersionMut = useMutation({
    mutationFn: (versionId: string) => documentApi.deleteVersion(id, versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
      toast.success("ลบไฟล์เรียบร้อยแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "ลบไฟล์ไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onDeleteFile(versionId: string, name: string) {
    const ok = await confirm({
      title: "ยืนยันการลบไฟล์",
      message: `ลบไฟล์ "${name}" อย่างถาวร?`,
      confirmLabel: "ลบไฟล์",
      tone: "danger",
    });
    if (ok) deleteVersionMut.mutate(versionId);
  }

  async function downloadFile(versionId: string, filename: string) {
    try {
      const blob = await documentApi.download(id, versionId);
      saveBlob(blob, filename);
    } catch {
      toast.error("ดาวน์โหลดไฟล์ไม่สำเร็จ");
    }
  }

  // Redirect non-admins away.
  useEffect(() => {
    if (meQ.data && !admin) router.replace(`/documents/${id}`);
  }, [meQ.data, admin, id, router]);

  // Populate form once when detail arrives.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !detailQ.data) return;
    seeded.current = true;
    const d = detailQ.data.document;
    const pt = detailQ.data.project_type;
    setProjectType(pt === "Modify" || pt === "Add-on" ? pt : "Standard");
    setCompanyName(d.company_name ?? "");
    setWorkOrder(d.work_order ?? "");
    setOwnerStaffID(d.owner_project_staff_id ?? "");
    setInstallDate(toDateInput(d.install_date));
    setNote(d.note ?? "");
    setUatStatus(normStatus(d.uat_status));
    setUatDate(toDateInput(d.uat_date));
    setUaiStatus(normStatus(d.uai_status));
    setUaiDate(toDateInput(d.uai_date));
  }, [detailQ.data]);

  const mut = useMutation({
    mutationFn: () => {
      if (!companyName.trim() || !workOrder.trim())
        throw new Error("กรุณากรอกชื่อบริษัทและ WorkOrder");
      if (!ownerStaffID) throw new Error("กรุณาเลือกผู้รับผิดชอบ Project");
      const patch: DocumentUpdate = {
        company_name: companyName.trim(),
        work_order: workOrder.trim(),
        project_type: projectType,
        owner_project_staff_id: ownerStaffID,
        install_date: installDate,
        uat_status: uatStatus,
        uat_date: uatDate,
        uai_status: uaiStatus,
        uai_date: uaiDate,
        note,
      };
      return documentApi.update(id, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
      toast.success("บันทึกการแก้ไขเรียบร้อยแล้ว");
      router.push(`/documents/${id}`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } }; message?: string })
          ?.response?.data?.error?.message ??
        (err as Error).message ??
        "บันทึกไม่สำเร็จ";
      setError(msg);
    },
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ok = await confirm({
      title: "ยืนยันการแก้ไข",
      message: `บันทึกการแก้ไขเอกสารของ "${companyName || "-"}"?`,
      confirmLabel: "บันทึก",
      tone: "primary",
    });
    if (ok) mut.mutate();
  }

  if (detailQ.isLoading || !meQ.data) return <MusicLoader />;
  if (!detailQ.data) return <div className="text-slate-400">ไม่พบเอกสาร</div>;
  if (!admin) return null;

  return (
    <div className="max-w-6xl space-y-6">
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link
              href={`/documents`}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"
            >
              <ArrowLeft size={14} /> Documents List
            </Link>
            <h1 className="text-2xl font-semibold mt-2">แก้ไขเอกสาร</h1>
            <p className="text-sm text-slate-500 mt-1">แก้ไขข้อมูล Project และสถานะ (เฉพาะผู้ดูแลระบบ)</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="submit"
              disabled={mut.isPending}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-lg shadow-sm shadow-brand-500/25 disabled:opacity-60"
            >
              <Save size={16} />
              {mut.isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
            <Link
              href={`/documents/${id}`}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              ยกเลิก
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left column — project info + UAT/UAI status */}
          <div className="lg:col-span-2 space-y-6">
            <section className="card p-6 space-y-5">
              <SectionHeader
                icon={FileText}
                title="ข้อมูล Project"
                subtitle="ประเภท / บริษัท / WorkOrder / ผู้รับผิดชอบ / วันติดตั้ง"
              />

              <Field label="ประเภท (Type)" required>
                <SearchableSelect
                  value={projectType}
                  onChange={(v) => setProjectType(v as ProjectType)}
                  options={PROJECT_TYPE_OPTIONS}
                  searchable={false}
                  allowClear={false}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="ชื่อบริษัท" required>
                  <SearchableSelect
                    value={companyName}
                    onChange={setCompanyName}
                    options={companyNames.map((n) => ({ id: n, label: n }))}
                    placeholder="-- เลือก / พิมพ์ชื่อบริษัท --"
                    creatable
                  />
                </Field>
                <Field label="WorkOrder" required>
                  <input
                    className="input"
                    value={workOrder}
                    onChange={(e) => setWorkOrder(e.target.value)}
                    required
                    placeholder="เช่น WO-2026-001"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="ผู้รับผิดชอบ Project" required>
                  <SearchableSelect
                    value={ownerStaffID}
                    onChange={setOwnerStaffID}
                    options={(staffQ.data ?? []).map((s) => ({
                      id: s.id,
                      label: s.full_name,
                      keywords: `${s.full_name} ${s.employee_id ?? ""}`,
                    }))}
                    placeholder="-- เลือก --"
                  />
                </Field>
                <Field label="วันที่ติดตั้ง">
                  <input
                    type="date"
                    className="input"
                    value={installDate}
                    onChange={(e) => setInstallDate(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="หมายเหตุ">
                <textarea
                  className="input"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </section>

            <section className="card p-6 space-y-5">
              <SectionHeader
                icon={ClipboardCheck}
                title="สถานะ UAI / UAT"
                subtitle="สถานะและวันที่ของ User Acceptance Test / Install"
              />

              <div className="grid grid-cols-2 gap-6">
                <StatusGroup
                  label="UAI"
                  status={uaiStatus}
                  onStatus={setUaiStatus}
                  date={uaiDate}
                  onDate={setUaiDate}
                />
                <StatusGroup
                  label="UAT"
                  status={uatStatus}
                  onStatus={setUatStatus}
                  date={uatDate}
                  onDate={setUatDate}
                />
              </div>
            </section>
          </div>

          {/* Right column — document attachments */}
          <div className="lg:col-span-1 space-y-6">
            <section className="card p-6 space-y-4">
              <SectionHeader
                icon={UploadCloud}
                title="ไฟล์แนบ"
                subtitle={`ไฟล์ปัจจุบัน และเพิ่มไฟล์ใหม่ (PDF/JPG/PNG ไม่เกิน ${MAX_FILE_MB} MB ต่อไฟล์)`}
              />

              {existingFiles.length > 0 ? (
                <ul className="space-y-1.5">
                  {existingFiles.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center gap-3 border border-slate-200 bg-slate-50/60 rounded-lg px-3 py-2"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                        <FileText size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate" title={v.original_file_name}>
                          {v.original_file_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          <span className="font-mono bg-slate-200 text-slate-600 rounded px-1 text-[10px] mr-1.5">
                            {v.kind === "ATTACHMENT" ? "FILE" : v.kind}
                          </span>
                          {(v.file_size_bytes / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadFile(v.id, v.original_file_name)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                        title="ดาวน์โหลด"
                      >
                        <Download size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteFile(v.id, v.original_file_name)}
                        disabled={deleteVersionMut.isPending}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        title="ลบไฟล์"
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-400">ยังไม่มีไฟล์แนบ</div>
              )}

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files) onPickFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition",
                  addFilesMut.isPending && "opacity-60 pointer-events-none",
                  dragOver
                    ? "border-brand-500 bg-brand-50"
                    : "border-slate-300 hover:border-brand-400 hover:bg-brand-50/40"
                )}
              >
                <UploadCloud size={28} className="text-brand-600" />
                <div className="text-sm text-slate-700">
                  {addFilesMut.isPending ? (
                    "กำลังอัปโหลด..."
                  ) : (
                    <>
                      <span className="text-brand-700 font-semibold">คลิกเพื่ออัปโหลด</span> หรือลากไฟล์มาวางที่นี่
                    </>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  รองรับไฟล์ PDF, JPG, PNG ไม่เกิน {MAX_FILE_MB} MB ต่อไฟล์
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) onPickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              {fileError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {fileError}
                </div>
              )}
            </section>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-slate-100">
      <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
        <Icon size={17} />
      </div>
      <div>
        <div className="font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function StatusGroup({
  label,
  status,
  onStatus,
  date,
  onDate,
}: {
  label: string;
  status: StatusValue;
  onStatus: (s: StatusChoice) => void;
  date: string;
  onDate: (v: string) => void;
}) {
  const OPTIONS: { value: StatusChoice; label: string; cls: string }[] = [
    { value: "Pending", label: "Pending", cls: "border-amber-300 text-amber-700 bg-amber-50" },
    { value: "Passed", label: "Passed", cls: "border-emerald-300 text-emerald-700 bg-emerald-50" },
    { value: "Failed", label: "Failed", cls: "border-rose-300 text-rose-700 bg-rose-50" },
  ];
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-700">{label}</div>

      <div>
        <div className="text-xs text-slate-500 mb-1.5">สถานะ</div>
        <div className="flex gap-2">
          {OPTIONS.map((opt) => {
            const active = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onStatus(opt.value)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${active ? "border-brand-600 bg-brand-600 text-white" : "bg-white " + opt.cls
                  }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-1.5">วันที่ {label}</div>
        <input type="date" className="input" value={date} onChange={(e) => onDate(e.target.value)} />
      </div>
    </div>
  );
}
