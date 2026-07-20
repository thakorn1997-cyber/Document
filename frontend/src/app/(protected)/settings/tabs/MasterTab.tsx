"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Building,
  Briefcase,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  departmentAdminApi,
  positionApi,
  staffApi,
  companyApi,
  masterApi,
  type Department,
  type Position,
  type Staff,
  type Company,
} from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/lib/utils";

type SubTab = "departments" | "positions" | "staff" | "companies";

export function MasterTab() {
  const [sub, setSub] = useState<SubTab>("departments");

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        จัดการข้อมูลกลาง — แผนก, ระดับงาน, รายชื่อพนักงาน และบริษัท (ใช้ใน dropdown ของ Upload)
      </p>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <SubTabButton
          active={sub === "departments"}
          icon={Building2}
          label="แผนก"
          onClick={() => setSub("departments")}
        />
        <SubTabButton
          active={sub === "positions"}
          icon={Briefcase}
          label="ระดับ"
          onClick={() => setSub("positions")}
        />
        <SubTabButton
          active={sub === "staff"}
          icon={Users}
          label="รายชื่อพนักงาน"
          onClick={() => setSub("staff")}
        />
        <SubTabButton
          active={sub === "companies"}
          icon={Building}
          label="บริษัท"
          onClick={() => setSub("companies")}
        />
      </div>

      {sub === "departments" && <DepartmentPanel />}
      {sub === "positions" && <PositionPanel />}
      {sub === "staff" && <StaffPanel />}
      {sub === "companies" && <CompanyPanel />}
    </div>
  );
}

function SubTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm transition-colors",
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

// ============ Departments ============

function DepartmentPanel() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-departments"], queryFn: departmentAdminApi.listAll });
  const [editing, setEditing] = useState<Department | "new" | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => departmentAdminApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-departments"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success("ลบแผนกแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "ลบไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onDelete(d: Department) {
    const ok = await confirm({
      title: "ยืนยันการลบแผนก",
      message: `ลบแผนก "${d.name_th}" ออกจากระบบถาวร?\n\nระบบจะตรวจสอบก่อน — ถ้าแผนกนี้ถูกใช้งานอยู่ (มีเอกสาร/พนักงาน/ผู้ใช้) จะลบไม่ได้`,
      confirmLabel: "ลบถาวร",
      tone: "danger",
    });
    if (ok) delMut.mutate(d.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">รายการแผนก</div>
        <button onClick={() => setEditing("new")} className="btn-primary inline-flex items-center gap-2">
          <Plus size={14} />
          เพิ่มแผนก
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-brand-50/60 text-brand-800 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 font-medium w-24">Code</th>
              <th className="px-4 py-2 font-medium">ชื่อภาษาไทย</th>
              <th className="px-4 py-2 font-medium">ชื่อภาษาอังกฤษ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {q.data?.map((d) => (
              <tr key={d.id} className={cn("border-t border-slate-100", !d.is_active && "opacity-60")}>
                <td className="px-4 py-2 font-mono text-xs">{d.code}</td>
                <td className="px-4 py-2">{d.name_th}</td>
                <td className="px-4 py-2 text-slate-600">{d.name_en}</td>
                <td className="px-4 py-2">
                  {d.is_active ? (
                    <span className="text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs">Active</span>
                  ) : (
                    <span className="text-slate-500 bg-slate-100 rounded px-2 py-0.5 text-xs">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Tooltip label="แก้ไข">
                      <button
                        onClick={() => setEditing(d)}
                        className="text-brand-700 hover:bg-brand-50 p-1.5 rounded"
                      >
                        <Pencil size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip label="ลบ">
                      <button
                        onClick={() => onDelete(d)}
                        className="text-rose-600 hover:bg-rose-50 p-1.5 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <DepartmentModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DepartmentModal({
  initial,
  onClose,
}: {
  initial: Department | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [code, setCode] = useState(initial?.code ?? "");
  const [nameTH, setNameTH] = useState(initial?.name_th ?? "");
  const [nameEN, setNameEN] = useState(initial?.name_en ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const isNew = !initial;

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        code: code.toUpperCase().trim(),
        name_th: nameTH.trim(),
        name_en: nameEN.trim(),
        is_active: isActive,
      };
      return isNew
        ? departmentAdminApi.create(payload)
        : departmentAdminApi.update(initial!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-departments"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success(isNew ? "เพิ่มแผนกเรียบร้อยแล้ว" : "บันทึกการแก้ไขเรียบร้อยแล้ว");
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "บันทึกไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onSave() {
    if (!code.trim() || !nameTH.trim()) return;
    const ok = await confirm({
      title: isNew ? "เพิ่มแผนกใหม่?" : "บันทึกการแก้ไข?",
      message: `Code: ${code.toUpperCase().trim()}\nชื่อ: ${nameTH}`,
      confirmLabel: "บันทึก",
      tone: "primary",
    });
    if (ok) mut.mutate();
  }

  return (
    <FormModal title={isNew ? "เพิ่มแผนก" : "แก้ไขแผนก"} onClose={onClose} onSave={onSave} saving={mut.isPending}>
      <FormRow label="Code" required>
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="เช่น HR"
          maxLength={32}
        />
      </FormRow>
      <FormRow label="ชื่อภาษาไทย" required>
        <input className="input" value={nameTH} onChange={(e) => setNameTH(e.target.value)} />
      </FormRow>
      <FormRow label="ชื่อภาษาอังกฤษ">
        <input className="input" value={nameEN} onChange={(e) => setNameEN(e.target.value)} />
      </FormRow>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="accent-brand-600"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Active
      </label>
    </FormModal>
  );
}

// ============ Positions ============

function PositionPanel() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-positions"], queryFn: positionApi.listAll });
  const [editing, setEditing] = useState<Position | "new" | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => positionApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-positions"] });
      qc.invalidateQueries({ queryKey: ["positions"] });
      toast.success("ลบระดับแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "ลบไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onDelete(p: Position) {
    const ok = await confirm({
      title: "ยืนยันการลบระดับ",
      message: `ลบระดับ "${p.name}" ออกจากระบบถาวร?\n\nระบบจะตรวจสอบก่อน — ถ้าระดับนี้ถูกใช้งานอยู่ (มีพนักงาน/ผู้ใช้) จะลบไม่ได้`,
      confirmLabel: "ลบถาวร",
      tone: "danger",
    });
    if (ok) delMut.mutate(p.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">รายการระดับ</div>
        <button onClick={() => setEditing("new")} className="btn-primary inline-flex items-center gap-2">
          <Plus size={14} />
          เพิ่มระดับ
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-brand-50/60 text-brand-800 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 font-medium w-24">Code</th>
              <th className="px-4 py-2 font-medium">ชื่อระดับ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {q.data?.map((p) => (
              <tr key={p.id} className={cn("border-t border-slate-100", !p.is_active && "opacity-60")}>
                <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">
                  {p.is_active ? (
                    <span className="text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs">Active</span>
                  ) : (
                    <span className="text-slate-500 bg-slate-100 rounded px-2 py-0.5 text-xs">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Tooltip label="แก้ไข">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-brand-700 hover:bg-brand-50 p-1.5 rounded"
                      >
                        <Pencil size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip label="ลบ">
                      <button
                        onClick={() => onDelete(p)}
                        className="text-rose-600 hover:bg-rose-50 p-1.5 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <PositionModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PositionModal({ initial, onClose }: { initial: Position | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const isNew = !initial;

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        code: code.toUpperCase().trim(),
        name: name.trim(),
        is_active: isActive,
      };
      return isNew
        ? positionApi.create(payload)
        : positionApi.update(initial!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-positions"] });
      qc.invalidateQueries({ queryKey: ["positions"] });
      toast.success(isNew ? "เพิ่มระดับเรียบร้อยแล้ว" : "บันทึกการแก้ไขเรียบร้อยแล้ว");
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "บันทึกไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onSave() {
    if (!code.trim() || !name.trim()) return;
    const ok = await confirm({
      title: isNew ? "เพิ่มระดับใหม่?" : "บันทึกการแก้ไข?",
      message: `Code: ${code.toUpperCase().trim()}\nชื่อ: ${name}`,
      confirmLabel: "บันทึก",
      tone: "primary",
    });
    if (ok) mut.mutate();
  }

  return (
    <FormModal title={isNew ? "เพิ่มระดับ" : "แก้ไขระดับ"} onClose={onClose} onSave={onSave} saving={mut.isPending}>
      <FormRow label="Code" required>
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="เช่น SE"
          maxLength={32}
        />
      </FormRow>
      <FormRow label="ชื่อระดับ" required>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </FormRow>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="accent-brand-600"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Active
      </label>
    </FormModal>
  );
}

// ============ Companies ============

const COMPANY_PAGE_SIZE = 10;

function CompanyPanel() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-companies"], queryFn: companyApi.listAll });
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const delMut = useMutation({
    mutationFn: (id: string) => companyApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success("ลบบริษัทแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "ลบไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onDelete(cmp: Company) {
    const ok = await confirm({
      title: "ยืนยันการลบบริษัท",
      message: `ลบบริษัท "${cmp.name}" ออกจากระบบถาวร?\n\nระบบจะตรวจสอบก่อน — ถ้าบริษัทนี้ถูกใช้งานอยู่ในเอกสารจะลบไม่ได้\n(เอกสารเดิมยังเก็บชื่อบริษัทไว้)`,
      confirmLabel: "ลบถาวร",
      tone: "danger",
    });
    if (ok) delMut.mutate(cmp.id);
  }

  // Client-side search over name + work_order (case-insensitive).
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = q.data ?? [];
    if (!term) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(term) || c.work_order.toLowerCase().includes(term)
    );
  }, [q.data, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / COMPANY_PAGE_SIZE));
  // Typing a new search resets to page 1; a shrinking list (delete) clamps the page.
  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const start = (page - 1) * COMPANY_PAGE_SIZE;
  const paged = filtered.slice(start, start + COMPANY_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm font-semibold text-slate-700">รายการบริษัท</div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาบริษัท / WorkOrder"
              className="input pl-8 pr-8 py-1.5 w-56 rounded-full px-5.5 py-5.5"
            />
            {search && (
              <Tooltip label="ล้างคำค้นหา" className="absolute right-2 top-1/2 -translate-y-1/2">
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </Tooltip>
            )}
          </div>
          <button onClick={() => setEditing("new")} className="btn-primary inline-flex items-center gap-2">
            <Plus size={14} />
            เพิ่มบริษัท
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-brand-50/60 text-brand-800 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 font-medium">ชื่อบริษัท</th>
              <th className="px-4 py-2 font-medium whitespace-nowrap">WorkOrder (ค่าเริ่มต้น)</th>
              <th className="px-4 py-2 font-medium w-32">สถานะ</th>
              <th className="px-4 py-2 font-medium text-right w-28">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!q.isLoading && (q.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  ยังไม่มีบริษัท — คลิก &quot;เพิ่มบริษัท&quot; เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {!q.isLoading && (q.data?.length ?? 0) > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  ไม่พบบริษัทที่ค้นหา &quot;{search.trim()}&quot;
                </td>
              </tr>
            )}
            {paged.map((cmp) => (
              <tr
                key={cmp.id}
                className={cn("border-t border-slate-100", !cmp.is_active && "opacity-60")}
              >
                <td className="px-4 py-2 font-medium text-slate-800">{cmp.name}</td>
                <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                  {cmp.work_order ? (
                    <span className="font-mono text-xs">{cmp.work_order}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {cmp.is_active ? (
                    <span className="text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs">
                      Active
                    </span>
                  ) : (
                    <span className="text-slate-500 bg-slate-100 rounded px-2 py-0.5 text-xs">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Tooltip label="แก้ไข">
                      <button
                        onClick={() => setEditing(cmp)}
                        className="text-brand-700 hover:bg-brand-50 p-1.5 rounded"
                      >
                        <Pencil size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip label="ลบ">
                      <button
                        onClick={() => onDelete(cmp)}
                        className="text-rose-600 hover:bg-rose-50 p-1.5 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > COMPANY_PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={COMPANY_PAGE_SIZE}
          onPage={setPage}
        />
      )}

      {editing !== null && (
        <CompanyModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// Numbered pagination bar (client-side). Shows a windowed range of page numbers
// with prev/next; collapses to first/last with ellipses when there are many pages.
function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  // Build page list with ellipses: first, last, and a window around current.
  const pages: (number | "…")[] = [];
  const window = 1; // pages on each side of current
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - window && p <= page + window)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  const btn =
    "min-w-8 h-8 px-2 inline-flex items-center justify-center rounded-lg border text-sm transition-colors";

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-xs text-slate-500">
        แสดง {from}–{to} จาก {totalItems} รายการ
      </div>
      <div className="flex items-center gap-1">
        <Tooltip label="ก่อนหน้า">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className={cn(
              btn,
              "border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
            )}
          >
            <ChevronLeft size={16} />
          </button>
        </Tooltip>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              className={cn(
                btn,
                p === page
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              {p}
            </button>
          )
        )}
        <Tooltip label="ถัดไป">
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            className={cn(
              btn,
              "border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
            )}
          >
            <ChevronRight size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function CompanyModal({ initial, onClose }: { initial: Company | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [workOrder, setWorkOrder] = useState(initial?.work_order ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const isNew = !initial;

  const mut = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), work_order: workOrder.trim(), is_active: isActive };
      return isNew ? companyApi.create(payload) : companyApi.update(initial!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      // A rename cascades to documents.company_name (no FK — stored by value),
      // so refresh every consumer of the documents list too.
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(isNew ? "เพิ่มบริษัทเรียบร้อยแล้ว" : "บันทึกการแก้ไขเรียบร้อยแล้ว");
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "บันทึกไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onSave() {
    if (!name.trim()) return;
    const ok = await confirm({
      title: isNew ? "เพิ่มบริษัทใหม่?" : "บันทึกการแก้ไข?",
      message: `ชื่อบริษัท: ${name.trim()}`,
      confirmLabel: "บันทึก",
      tone: "primary",
    });
    if (ok) mut.mutate();
  }

  return (
    <FormModal
      title={isNew ? "เพิ่มบริษัท" : "แก้ไขบริษัท"}
      onClose={onClose}
      onSave={onSave}
      saving={mut.isPending}
    >
      <FormRow label="ชื่อบริษัท" required>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น บริษัท ABC จำกัด"
          maxLength={255}
          autoFocus
        />
      </FormRow>
      <FormRow label="WorkOrder (ค่าเริ่มต้น)">
        <input
          className="input"
          value={workOrder}
          onChange={(e) => setWorkOrder(e.target.value)}
          placeholder="เช่น WR-S-01012026"
          maxLength={255}
        />
        <p className="text-xs text-slate-400 mt-1">
          จะถูกดึงไปใส่ช่อง WorkOrder อัตโนมัติเมื่อเลือกบริษัทนี้ตอนเพิ่มเอกสาร (ยังแก้ไขเองได้)
        </p>
      </FormRow>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="accent-brand-600"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Active
      </label>
    </FormModal>
  );
}

// ============ Shared modal wrapper ============

function FormModal({
  title,
  children,
  onClose,
  onSave,
  saving,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  if (typeof document === "undefined") return null;
  // Portal ไป <body> + backdrop -inset-8: กัน fixed เพี้ยนจาก ancestor ในเพจ
  // และกัน backdrop-blur เว้นแถบขาวริมจอ (มาตรฐาน modal ทุกตัว)
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-hidden"
      onClick={onClose}
    >
      <div className="absolute -inset-8 bg-slate-900/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
          >
            ยกเลิก
          </button>
          <button onClick={onSave} disabled={saving} className="btn-primary inline-flex items-center gap-2">
            <Save size={14} />
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FormRow({
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
      <label className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ============ Staff ============

function StaffPanel() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-staff"], queryFn: staffApi.listAll });
  const [editing, setEditing] = useState<Staff | "new" | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => staffApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("ลบพนักงานแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "ลบไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onDelete(s: Staff) {
    const ok = await confirm({
      title: "ยืนยันการลบพนักงาน",
      message: `ลบพนักงาน "${s.full_name}" ออกจากระบบถาวร?\n\nระบบจะตรวจสอบก่อน — ถ้าพนักงานนี้ถูกใช้เป็นผู้รับผิดชอบในเอกสารจะลบไม่ได้`,
      confirmLabel: "ลบถาวร",
      tone: "danger",
    });
    if (ok) delMut.mutate(s.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">รายชื่อพนักงาน</div>
        <button
          onClick={() => setEditing("new")}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus size={14} />
          เพิ่มพนักงาน
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-brand-50/60 text-brand-800 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 font-medium w-32">รหัสพนักงาน</th>
              <th className="px-4 py-2 font-medium">ชื่อ-สกุล</th>
              <th className="px-4 py-2 font-medium">แผนก</th>
              <th className="px-4 py-2 font-medium">ระดับ</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!q.isLoading && q.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  ยังไม่มีข้อมูลพนักงาน — คลิก &quot;เพิ่มพนักงาน&quot; เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {q.data?.map((s) => (
              <tr
                key={s.id}
                className={cn("border-t border-slate-100", !s.is_active && "opacity-60")}
              >
                <td className="px-4 py-2 font-mono text-xs">{s.employee_id}</td>
                <td className="px-4 py-2 font-medium text-slate-800">{s.full_name}</td>
                <td className="px-4 py-2 text-slate-600 text-xs">
                  {s.department ? (
                    <span>
                      <span className="font-mono text-slate-500 mr-1">{s.department.code}</span>
                      {s.department.name_th}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600 text-xs">
                  {s.position?.name ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2">
                  {s.is_active ? (
                    <span className="text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs">
                      Active
                    </span>
                  ) : (
                    <span className="text-slate-500 bg-slate-100 rounded px-2 py-0.5 text-xs">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Tooltip label="แก้ไข">
                      <button
                        onClick={() => setEditing(s)}
                        className="text-brand-700 hover:bg-brand-50 p-1.5 rounded"
                      >
                        <Pencil size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip label="ลบ">
                      <button
                        onClick={() => onDelete(s)}
                        className="text-rose-600 hover:bg-rose-50 p-1.5 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <StaffModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function StaffModal({ initial, onClose }: { initial: Staff | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const deptQ = useQuery({ queryKey: ["departments"], queryFn: masterApi.departments });
  const posQ = useQuery({ queryKey: ["positions"], queryFn: positionApi.list });

  const [employeeId, setEmployeeId] = useState(initial?.employee_id ?? "");
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [deptId, setDeptId] = useState(initial?.department_id ?? "");
  const [posId, setPosId] = useState(initial?.position_id ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const isNew = !initial;

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        employee_id: employeeId.trim(),
        full_name: fullName.trim(),
        department_id: deptId || undefined,
        position_id: posId || undefined,
        is_active: isActive,
      };
      return isNew ? staffApi.create(payload) : staffApi.update(initial!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success(isNew ? "เพิ่มพนักงานเรียบร้อยแล้ว" : "บันทึกการแก้ไขเรียบร้อยแล้ว");
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "บันทึกไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onSave() {
    if (!employeeId.trim() || !fullName.trim()) return;
    const ok = await confirm({
      title: isNew ? "เพิ่มพนักงานใหม่?" : "บันทึกการแก้ไข?",
      message: `รหัส: ${employeeId}\nชื่อ: ${fullName}`,
      confirmLabel: "บันทึก",
      tone: "primary",
    });
    if (ok) mut.mutate();
  }

  return (
    <FormModal
      title={isNew ? "เพิ่มพนักงาน" : "แก้ไขพนักงาน"}
      onClose={onClose}
      onSave={onSave}
      saving={mut.isPending}
    >
      <div className="grid grid-cols-2 gap-3">
        <FormRow label="รหัสพนักงาน" required>
          <input
            className="input"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="เช่น 20009"
            maxLength={64}
          />
        </FormRow>
        <FormRow label="ชื่อ-สกุล" required>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="เช่น สมชาย ใจดี"
          />
        </FormRow>
      </div>

      <FormRow label="แผนก">
        <select className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
          <option value="">-- ไม่ระบุ --</option>
          {deptQ.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name_th}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow label="ระดับ">
        <select className="input" value={posId} onChange={(e) => setPosId(e.target.value)}>
          <option value="">-- ไม่ระบุ --</option>
          {posQ.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </FormRow>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="accent-brand-600"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Active
      </label>
    </FormModal>
  );
}
