"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Upload as UploadIcon,
  FileText,
  ClipboardCheck,
  X,
  UploadCloud,
  Save,
} from "lucide-react";
import { documentApi, staffApi, companyApi, authApi } from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { SearchableSelect } from "@/components/SearchableSelect";
import { DatePicker } from "@/components/DatePicker";
import { Tooltip } from "@/components/Tooltip";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { cn } from "@/lib/utils";

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

export default function UploadPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const staffQ = useQuery({ queryKey: ["staff"], queryFn: staffApi.list });
  const companiesQ = useQuery({ queryKey: ["companies"], queryFn: companyApi.list });
  const companyNames = (companiesQ.data ?? []).map((c) => c.name);
  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const admin = (meQ.data?.roles ?? []).some((r) => r === "SystemAdmin" || r === "admin");
  // Companies added via the "＋" row this session (name → id) so we can set their
  // default WorkOrder at save time (only for Standard docs).
  const createdCompanies = useRef<Map<string, string>>(new Map());

  // Selecting a company pulls its default WorkOrder into the field (option A: overwrite);
  // only when that company has a non-empty default, so we never wipe a manually typed value.
  // The field stays editable, so the user can still change the number afterward.
  function onCompanyChange(v: string) {
    setCompanyName(v);
    const match = (companiesQ.data ?? []).find((c) => c.name === v);
    if (match && match.work_order.trim()) setWorkOrder(match.work_order);
  }

  // Admin-only: "＋ เพิ่ม" persists the typed company into the Master, then selects it.
  // Its default WorkOrder is captured later at save time (see mut) for Standard docs.
  async function onCreateCompany(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Already in Master (case-insensitive) → just select it (and pull its default WO).
    const existing = (companiesQ.data ?? []).find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      onCompanyChange(existing.name);
      return;
    }
    try {
      const res = await companyApi.create({ name: trimmed });
      createdCompanies.current.set(trimmed, res.id);
      await qc.invalidateQueries({ queryKey: ["companies"] });
      setCompanyName(trimmed);
      toast.success(`เพิ่มบริษัท "${trimmed}" เข้าระบบแล้ว`);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        // Someone created it between the list load and now — treat as select.
        setCompanyName(trimmed);
        await qc.invalidateQueries({ queryKey: ["companies"] });
        toast.info("บริษัทนี้มีอยู่แล้ว เลือกให้อัตโนมัติ");
      } else {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
            ?.error?.message ?? "เพิ่มบริษัทไม่สำเร็จ";
        toast.error(msg);
      }
    }
  }

  // Section 1: Project
  const [projectType, setProjectType] = useState<ProjectType>("Standard");
  const [companyName, setCompanyName] = useState("");
  const [workOrder, setWorkOrder] = useState("");
  const [ownerStaffID, setOwnerStaffID] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [note, setNote] = useState("");

  // Section 2: UAT/UAI status (no default selection on first load)
  const [uatStatus, setUatStatus] = useState<StatusValue>("");
  const [uatDate, setUatDate] = useState("");
  const [uaiStatus, setUaiStatus] = useState<StatusValue>("");
  const [uaiDate, setUaiDate] = useState("");

  // Business rule: Modify projects do not use UAI — lock the group and clear
  // any value picked before the type was switched.
  const uaiLocked = projectType === "Modify";
  function onTypeChange(v: string) {
    const t = v as ProjectType;
    setProjectType(t);
    if (t === "Modify") {
      setUaiStatus("");
      setUaiDate("");
    }
  }

  // Section 3: unified file list
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [error, setError] = useState<string | null>(null);

  function addFiles(newFiles: FileList | File[]) {
    setError(null);
    const list = Array.from(newFiles);
    const valid: File[] = [];
    for (const f of list) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`ไฟล์ "${f.name}" มีขนาดเกิน ${MAX_FILE_MB} MB`);
        continue;
      }
      if (!ALLOWED_MIMES.includes(f.type)) {
        setError(`ไฟล์ "${f.name}" ต้องเป็น PDF, JPG หรือ PNG`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (!companyName.trim() || !workOrder.trim())
        throw new Error("กรุณากรอกชื่อบริษัทและ WorkOrder");
      if (!ownerStaffID) throw new Error("กรุณาเลือกผู้รับผิดชอบ Project");

      const form = new FormData();
      form.append("title", `${companyName} - WO ${workOrder}`);
      form.append("project_type", projectType);
      form.append("company_name", companyName);
      form.append("work_order", workOrder);
      form.append("owner_project_staff_id", ownerStaffID);
      if (installDate) form.append("install_date", installDate);
      form.append("note", note);
      if (uatStatus) form.append("uat_status", uatStatus);
      if (uatDate) form.append("uat_date", uatDate);
      if (uaiStatus) form.append("uai_status", uaiStatus);
      if (uaiDate) form.append("uai_date", uaiDate);
      for (const f of files) form.append("files", f);
      const created = await documentApi.create(form);

      // If an admin added this company from the field, capture the WorkOrder as its
      // Master default — but only for Standard-type docs (the "Standard WO" convention).
      // Best-effort: the document is already saved, so a failure here is non-fatal.
      if (admin && projectType === "Standard" && workOrder.trim()) {
        const cid = createdCompanies.current.get(companyName.trim());
        if (cid) {
          try {
            await companyApi.update(cid, {
              name: companyName.trim(),
              work_order: workOrder.trim(),
            });
            qc.invalidateQueries({ queryKey: ["companies"] });
          } catch {
            /* default WO is a nice-to-have; ignore */
          }
        }
      }
      return created;
    },
    onSuccess: (res: { id: string }) => {
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
      // Toast lives in the app-level provider, so it survives the redirect and shows on the detail page.
      toast.success("บันทึกเอกสารเรียบร้อยแล้ว");
      router.push(`/documents/${res.id}`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } }; message?: string })
          ?.response?.data?.error?.message ??
        (err as Error).message ??
        "อัปโหลดไม่สำเร็จ";
      setError(msg);
      toast.error(msg);
    },
  });

  // Warn before leaving with unsaved edits (compared against the initial empty form).
  const isDirty =
    projectType !== "Standard" ||
    companyName !== "" ||
    workOrder !== "" ||
    ownerStaffID !== "" ||
    installDate !== "" ||
    note !== "" ||
    uatStatus !== "" ||
    uatDate !== "" ||
    uaiStatus !== "" ||
    uaiDate !== "" ||
    files.length > 0;
  // Once the save succeeds we navigate programmatically, so stop guarding.
  useUnsavedGuard(isDirty && !mut.isSuccess);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const summary =
      `บริษัท: ${companyName || "-"}\n` +
      `WorkOrder: ${workOrder || "-"}\n` +
      `ประเภท: ${projectType}\n` +
      `จำนวนไฟล์: ${files.length}`;
    const ok = await confirm({
      title: "ยืนยันการอัปโหลด",
      message: `เอกสารจะถูกบันทึกและแจ้งเตือนไปยังทุกคน\n\n${summary}`,
      confirmLabel: "อัปโหลด",
      tone: "primary",
    });
    if (ok) mut.mutate();
  }

  return (
    <div className="max-w-6xl space-y-6">
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Tooltip label="กลับไปหน้ารายการเอกสาร">
              <Link
                href="/documents"
                aria-label="กลับไปหน้ารายการเอกสาร"
                className="w-10 h-10 rounded-full border border-slate-300 bg-white flex items-center justify-center text-slate-600 shadow-sm hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 transition-colors shrink-0"
              >
                <ArrowLeft size={18} />
              </Link>
            </Tooltip>
            <div>
              <h1 className="text-2xl font-semibold">อัปโหลดเอกสาร</h1>
              <p className="text-sm text-slate-500 mt-1">กรอกข้อมูล Project และแนบไฟล์เอกสาร</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="submit"
              disabled={mut.isPending}
              className="inline-flex items-center gap-2 rounded-[10px] bg-gradient-to-br from-blue-600 to-indigo-600 px-[17px] py-[9px] text-sm font-medium text-white shadow-[0_3px_10px_rgba(79,70,229,0.30)] transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-[0_4px_14px_rgba(79,70,229,0.38)] active:scale-[0.98]"
            >
              <Save size={16} />
              {mut.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <Link
              href="/documents"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              ยกเลิก
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left column — project info + UAT/UAI status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section 1 */}
            <section className="card p-6 space-y-5">
              <SectionHeader
                icon={FileText}
                title="ข้อมูล Project"
                subtitle="ประเภท / บริษัท / WorkOrder / ผู้รับผิดชอบ / วันติดตั้ง"
              />

              <Field label="ประเภท (Type)" required>
                <SearchableSelect
                  value={projectType}
                  onChange={onTypeChange}
                  options={PROJECT_TYPE_OPTIONS}
                  searchable={false}
                  allowClear={false}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="ชื่อบริษัท" required>
                  <SearchableSelect
                    value={companyName}
                    onChange={onCompanyChange}
                    options={companyNames.map((n) => ({ id: n, label: n }))}
                    placeholder="-- เลือก / พิมพ์ชื่อบริษัท --"
                    creatable
                    onCreate={admin ? onCreateCompany : undefined}
                    createLabel={admin ? "เพิ่ม" : "ใช้"}
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
                  {staffQ.data && staffQ.data.length === 0 && (
                    <div className="text-xs text-amber-700 mt-1">
                      ยังไม่มีข้อมูลพนักงาน — Admin เพิ่มได้ที่ Settings → Master → รายชื่อพนักงาน
                    </div>
                  )}
                </Field>
                <Field label="วันที่ติดตั้ง">
                  <DatePicker value={installDate} onChange={setInstallDate} />
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

            {/* Section 2 — UAT/UAI status */}
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
                  disabled={uaiLocked}
                  disabledNote="ประเภท Modify ไม่ต้องระบุสถานะ UAI"
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
            {/* Section 3 — Unified file upload */}
            <section className="card p-6 space-y-4">
              <SectionHeader
                icon={UploadCloud}
                title="ไฟล์แนบ"
                subtitle={`Drag & Drop หรือคลิกเพื่ออัปโหลด (PDF/JPG/PNG ไม่เกิน ${MAX_FILE_MB} MB ต่อไฟล์)`}
              />

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition",
                  dragOver
                    ? "border-brand-500 bg-brand-50"
                    : "border-slate-300 hover:border-brand-400 hover:bg-brand-50/40"
                )}
              >
                <UploadCloud size={28} className="text-brand-600" />
                <div className="text-sm text-slate-700">
                  <span className="text-brand-700 font-semibold">คลิกเพื่ออัปโหลด</span> หรือลากไฟล์มาวางที่นี่
                </div>
                <div className="text-xs text-slate-500">
                  รองรับไฟล์ PDF, JPG, PNG ไม่เกิน {MAX_FILE_MB} MB ต่อไฟล์
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              {files.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-600">
                    รายการไฟล์ที่แนบ ({files.length})
                  </div>
                  <ul className="space-y-1.5">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-3 border border-brand-200 bg-brand-50/40 rounded-lg px-3 py-2"
                      >
                        <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                          <FileText size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{f.name}</div>
                          <div className="text-xs text-slate-500">
                            {(f.size / 1024).toFixed(1)} KB · {f.type || "unknown"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="ลบไฟล์"
                        >
                          <X size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
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
  disabled,
  disabledNote,
}: {
  label: string;
  status: StatusValue;
  onStatus: (s: StatusChoice) => void;
  date: string;
  onDate: (v: string) => void;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const OPTIONS: { value: StatusChoice; label: string; cls: string }[] = [
    { value: "Pending", label: "Pending", cls: "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-800" },
    { value: "Passed", label: "Passed", cls: "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-800" },
    { value: "Failed", label: "Failed", cls: "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 border border-red-800" },
  ];
  return (
    <div className={cn("space-y-3", disabled && "opacity-50")}>
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
                disabled={disabled}
                onClick={() => onStatus(opt.value)}
                className={cn(
                  "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                  active ? "border-brand-600 bg-brand-600 text-white" : "bg-white " + opt.cls,
                  disabled && "cursor-not-allowed"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-1.5">วันที่ {label}</div>
        <DatePicker value={date} disabled={disabled} onChange={onDate} />
      </div>

      {disabled && disabledNote && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          {disabledNote}
        </div>
      )}
    </div>
  );
}
