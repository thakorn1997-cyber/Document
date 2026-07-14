"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Check, CheckCircle2, Pencil, Trash2,
  Filter, ArrowUp, ArrowDown, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { documentApi, authApi, type DocumentSummary } from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { cn, saveBlob } from "@/lib/utils";
import { useDragScroll } from "@/lib/useDragScroll";
import { MusicLoader } from "@/components/MusicLoader";

function isAdminRole(roles?: string[]) {
  return (roles ?? []).some((r) => r === "SystemAdmin" || r === "admin");
}

type SortDir = "asc" | "desc";

type Column = {
  key: string;
  label: string;
  center?: boolean;
  getValue: (d: DocumentSummary) => string;
  sortValue: (d: DocumentSummary) => string | number;
  // Present on date columns → filter by a from/to range instead of a value list.
  date?: (d: DocumentSummary) => string | null | undefined;
};

type DateRange = { from: string; to: string };

const DASH = "—";
const colDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString("th-TH-u-ca-gregory") : DASH);
const colTs = (v?: string | null) => (v ? new Date(v).getTime() : 0);
// Local calendar day as "YYYY-MM-DD" (matches <input type="date"> values, timezone-safe).
const toDayStr = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// Order MUST match the body <td> cells below.
const COLUMNS: Column[] = [
  { key: "company", label: "บริษัท", getValue: (d) => d.company_name?.trim() || DASH, sortValue: (d) => d.company_name?.trim() || "" },
  { key: "type", label: "ประเภท", getValue: (d) => d.project_type || DASH, sortValue: (d) => d.project_type || "" },
  { key: "install", label: "วันที่ติดตั้ง", getValue: (d) => colDate(d.install_date), sortValue: (d) => colTs(d.install_date), date: (d) => d.install_date },
  { key: "wo", label: "WorkOrder", getValue: (d) => d.work_order?.trim() || DASH, sortValue: (d) => d.work_order?.trim() || "" },
  { key: "owner", label: "เจ้าหน้าที่", getValue: (d) => d.owner_project_name?.trim() || DASH, sortValue: (d) => d.owner_project_name?.trim() || "" },
  { key: "uai_status", label: "Status UAI", getValue: (d) => d.uai_status || DASH, sortValue: (d) => d.uai_status || "" },
  { key: "uai_date", label: "Date UAI", getValue: (d) => colDate(d.uai_date), sortValue: (d) => colTs(d.uai_date), date: (d) => d.uai_date },
  { key: "uat_status", label: "Status UAT", getValue: (d) => d.uat_status || DASH, sortValue: (d) => d.uat_status || "" },
  { key: "uat_date", label: "Date UAT", getValue: (d) => colDate(d.uat_date), sortValue: (d) => colTs(d.uat_date), date: (d) => d.uat_date },
  { key: "files", label: "ไฟล์", getValue: (d) => ((d.files?.length ?? 0) > 0 ? "มีไฟล์" : "ไม่มีไฟล์"), sortValue: (d) => d.files?.length ?? 0 },
  { key: "ack", label: "รับทราบ", center: true, getValue: (d) => (d.ack_count > 0 ? "รับทราบแล้ว" : "ยังไม่รับทราบ"), sortValue: (d) => d.ack_count },
];

export default function DocumentsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({
    queryKey: ["documents", "all"],
    queryFn: () => documentApi.list({ size: 500 }),
  });
  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const admin = isAdminRole(meQ.data?.roles);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, DateRange>>({});
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const dragScrollRef = useDragScroll<HTMLDivElement>();
  const [page, setPage] = useState(1);

  const base = q.data?.data ?? [];

  // Distinct values per column (from the full dataset) for the filter dropdowns.
  const distinctByCol = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const col of COLUMNS) {
      const set = new Set<string>();
      base.forEach((d) => set.add(col.getValue(d)));
      m[col.key] = Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.data]);

  const activeFilterCount =
    Object.values(filters).filter((v) => v && v.length).length +
    Object.values(dateFilters).filter((r) => r && (r.from || r.to)).length;

  let items = base.filter((d) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      (d.company_name ?? "").toLowerCase().includes(s) ||
      (d.work_order ?? "").toLowerCase().includes(s) ||
      (d.owner_project_name ?? "").toLowerCase().includes(s) ||
      d.code.toLowerCase().includes(s)
    );
  });
  for (const col of COLUMNS) {
    if (col.date) {
      const range = dateFilters[col.key];
      if (range && (range.from || range.to)) {
        items = items.filter((d) => {
          const day = toDayStr(col.date!(d));
          if (!day) return false; // rows without a date fall in no range
          if (range.from && day < range.from) return false;
          if (range.to && day > range.to) return false;
          return true;
        });
      }
      continue;
    }
    const sel = filters[col.key];
    if (sel && sel.length) items = items.filter((d) => sel.includes(col.getValue(d)));
  }
  if (sort) {
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (col) {
      items = [...items].sort((a, b) => {
        const av = col.sortValue(a);
        const bv = col.sortValue(b);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "th");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
  }

  const colSpan = 1 + COLUMNS.length + (admin ? 1 : 0);

  // Client-side pagination over the filtered/sorted set.
  const totalItems = items.length;
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = pageSize === "all" ? 0 : (currentPage - 1) * pageSize;
  const pageItems = pageSize === "all" ? items : items.slice(offset, offset + pageSize);

  // Reset to page 1 when the result set or page size changes.
  useEffect(() => {
    setPage(1);
  }, [search, filters, dateFilters, sort, pageSize]);

  function clearAll() {
    setFilters({});
    setDateFilters({});
    setSort(null);
  }

  async function download(docId: string, versionId: string, filename: string) {
    try {
      const blob = await documentApi.download(docId, versionId);
      saveBlob(blob, filename);
    } catch {
      toast.error("ดาวน์โหลดไฟล์ไม่สำเร็จ");
    }
  }

  const ackMut = useMutation({
    mutationFn: (id: string) => documentApi.acknowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", "all"] }),
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "รับทราบไม่สำเร็จ";
      toast.error(msg);
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
    },
  });

  async function onAck(id: string, company: string) {
    const ok = await confirm({
      title: "ยืนยันการรับทราบ",
      message: `บันทึกว่าคุณได้รับทราบเอกสารของ "${company}" แล้ว?\n\n⚠ การรับทราบเป็นการล็อกถาวร ไม่สามารถยกเลิกได้\n(ทั้งเอกสารสามารถรับทราบได้ครั้งเดียว)`,
      confirmLabel: "รับทราบ",
      tone: "success",
    });
    if (ok) ackMut.mutate(id);
  }

  const delMut = useMutation({
    mutationFn: (id: string) => documentApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
      toast.success("ลบเอกสารเรียบร้อยแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "ลบไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onDelete(id: string, company: string) {
    const ok = await confirm({
      title: "ยืนยันการลบเอกสาร",
      message: `ลบเอกสารของ "${company}" อย่างถาวร?\n\n⚠ ไฟล์แนบทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้`,
      confirmLabel: "ลบถาวร",
      tone: "danger",
    });
    if (ok) delMut.mutate(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          {/* <h1 className="text-2xl font-semibold">Documents</h1> */}
          <p className="text-sm text-slate-500 mt-1">รายการเอกสารทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9 w-64 rounded-full px-5.5 py-5.5"
              placeholder="ค้นหา บริษัท / WO / ผู้รับผิดชอบ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link href="/documents/upload" className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} />
            เพิ่มเอกสาร
          </Link>
        </div>
      </div>

      {q.isLoading ? (
        <div className="card"><MusicLoader /></div>
      ) : base.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-xl py-16 text-center bg-white">
          <div className="text-slate-400 text-sm">
            ยังไม่มีเอกสาร — คลิก &apos;เพิ่มเอกสาร&apos; เพื่อเริ่มบันทึก
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div ref={dragScrollRef} className="overflow-x-auto cursor-grab active:cursor-grabbing">
            <table className="min-w-full text-sm">
              <thead className="bg-brand-50/60 text-slate-900 text-left text-[14px] tracking-wide [&_th]:whitespace-nowrap">
                <tr>
                  <th className="px-2.5 py-3 font-semibold w-10 text-center"></th>
                  {COLUMNS.map((col) => (
                    <ColumnHeader
                      key={col.key}
                      col={col}
                      options={distinctByCol[col.key] ?? []}
                      selected={filters[col.key] ?? []}
                      range={dateFilters[col.key] ?? { from: "", to: "" }}
                      sortDir={sort?.key === col.key ? sort.dir : null}
                      open={openCol === col.key}
                      onToggleOpen={() => setOpenCol((o) => (o === col.key ? null : col.key))}
                      onClose={() => setOpenCol(null)}
                      onSort={(dir) => setSort(dir ? { key: col.key, dir } : null)}
                      onChangeSelected={(vals) =>
                        setFilters((f) => ({ ...f, [col.key]: vals }))
                      }
                      onChangeRange={(r) =>
                        setDateFilters((f) => ({ ...f, [col.key]: r }))
                      }
                    />
                  ))}
                  {admin && <th className="px-2.5 py-3 font-semibold text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-slate-400">
                      ไม่พบเอกสารตามเงื่อนไขที่กรอง
                    </td>
                  </tr>
                )}
                {pageItems.map((d, i) => (
                  <tr key={d.id} className="border-t border-slate-100 hover:bg-brand-50/30 align-middle">
                    <td className="px-2.5 py-3 text-center text-slate-500 text-sm">{offset + i + 1}</td>
                    <td className="px-2.5 py-3">
                      <Link
                        href={`/documents/${d.id}`}
                        className="text-brand-700 hover:underline font-medium whitespace-nowrap text-[15px]"
                      >
                        {d.company_name || "-"}
                      </Link>
                    </td>
                    <td className="px-2.5 py-3">
                      <TypeBadge type={d.project_type} />
                    </td>
                    <td className="px-2.5 py-3 text-slate-600 text-sm whitespace-nowrap">{fmtDate(d.install_date)}</td>
                    <td className="px-2.5 py-3 font-mono text-sm whitespace-nowrap">{d.work_order || "-"}</td>
                    <td className="px-2.5 py-3 text-slate-700 text-sm whitespace-nowrap">
                      {d.owner_project_name || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2.5 py-3">
                      <StatusBadge status={d.uai_status} />
                    </td>
                    <td className="px-2.5 py-3 text-slate-600 text-sm whitespace-nowrap">{fmtDate(d.uai_date)}</td>
                    <td className="px-2.5 py-3">
                      <StatusBadge status={d.uat_status} />
                    </td>
                    <td className="px-2.5 py-3 text-slate-600 text-sm whitespace-nowrap">{fmtDate(d.uat_date)}</td>
                    <td className="px-2.5 py-3">
                      <FileList
                        files={d.files ?? []}
                        onDownload={(fileId, name) => download(d.id, fileId, name)}
                      />
                    </td>
                    <td className="px-2.5 py-3 text-center">
                      <AckButton
                        locked={d.ack_count > 0}
                        byMe={d.acknowledged_by_me}
                        byName={d.acknowledged_by_name ?? null}
                        onClick={() => onAck(d.id, d.company_name || d.code)}
                        pending={ackMut.isPending}
                      />
                    </td>
                    {admin && (
                      <td className="px-2.5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/documents/${d.id}/edit`}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                            title="แก้ไข"
                          >
                            <Pencil size={15} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => onDelete(d.id, d.company_name || d.code)}
                            disabled={delMut.isPending}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            title="ลบ"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span>แสดง</span>
              <select
                value={String(pageSize)}
                onChange={(e) => setPageSize(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="input h-8 py-1 w-auto text-xs"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="all">ทั้งหมด</option>
              </select>
              <span>
                รายการ · ทั้งหมด {totalItems}
                {totalItems !== base.length && <span className="text-slate-400"> (กรองจาก {base.length})</span>}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {(activeFilterCount > 0 || sort) && (
                <button
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800 hover:underline"
                >
                  <X size={12} />
                  ล้างตัวกรอง{sort ? "/การเรียง" : ""}ทั้งหมด
                </button>
              )}
              {pageSize !== "all" && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="หน้าก่อนหน้า"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="tabular-nums px-1">
                    หน้า {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="หน้าถัดไป"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnHeader({
  col,
  options,
  selected,
  range,
  sortDir,
  open,
  onToggleOpen,
  onClose,
  onSort,
  onChangeSelected,
  onChangeRange,
}: {
  col: Column;
  options: string[];
  selected: string[];
  range: DateRange;
  sortDir: SortDir | null;
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onSort: (dir: SortDir | null) => void;
  onChangeSelected: (vals: string[]) => void;
  onChangeRange: (r: DateRange) => void;
}) {
  const isDate = !!col.date;
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [q, setQ] = useState("");

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 232;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      onClose();
    }
    function onScrollOrResize() {
      onClose();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, onClose]);

  const active = isDate ? !!(range.from || range.to) : selected.length > 0;
  const shown = options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));

  function toggleVal(v: string) {
    onChangeSelected(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <th className={cn("px-2.5 py-3 font-semibold", col.center && "text-center")}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggleOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1 -mx-1 py-0.5 hover:text-brand-700 hover:bg-brand-100/60 transition-colors",
          (active || sortDir) && "text-brand-700"
        )}
        title="กรอง / เรียงลำดับ"
      >
        <span>{col.label}</span>
        {sortDir === "asc" && <ArrowUp size={12} />}
        {sortDir === "desc" && <ArrowDown size={12} />}
        <Filter size={11} className={active ? "opacity-100 fill-brand-600" : "opacity-40"} />
        {active && !isDate && (
          <span className="text-[10px] leading-none bg-brand-600 text-white rounded-full px-1 py-0.5">
            {selected.length}
          </span>
        )}
      </button>

      {open && pos && (
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 232 }}
          className="z-50 rounded-xl border border-slate-200 bg-white shadow-xl p-2 text-left font-normal normal-case whitespace-normal text-slate-700"
        >
          <div className="flex gap-1 mb-2">
            <button
              type="button"
              onClick={() => onSort(sortDir === "asc" ? null : "asc")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs border",
                sortDir === "asc"
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <ArrowUp size={12} /> น้อย→มาก
            </button>
            <button
              type="button"
              onClick={() => onSort(sortDir === "desc" ? null : "desc")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs border",
                sortDir === "desc"
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <ArrowDown size={12} /> มาก→น้อย
            </button>
          </div>

          {isDate ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-[11px] text-slate-500">ตั้งแต่วันที่</span>
                <input
                  type="date"
                  value={range.from}
                  max={range.to || undefined}
                  onChange={(e) => onChangeRange({ ...range, from: e.target.value })}
                  className="w-full mt-0.5 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:border-brand-400"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500">ถึงวันที่</span>
                <input
                  type="date"
                  value={range.to}
                  min={range.from || undefined}
                  onChange={(e) => onChangeRange({ ...range, to: e.target.value })}
                  className="w-full mt-0.5 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:border-brand-400"
                />
              </label>
              {(range.from || range.to) && (
                <button
                  type="button"
                  onClick={() => onChangeRange({ from: "", to: "" })}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                >
                  <X size={11} /> ล้างช่วงวันที่
                </button>
              )}
            </div>
          ) : (
            <>
              {options.length > 8 && (
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นหาค่า..."
                  className="w-full mb-2 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:border-brand-400"
                />
              )}

              <div className="flex items-center justify-between px-1 mb-1 text-[11px]">
                <button type="button" onClick={() => onChangeSelected(options)} className="text-slate-500 hover:text-brand-700">
                  เลือกทั้งหมด
                </button>
                <button type="button" onClick={() => onChangeSelected([])} className="text-slate-500 hover:text-brand-700">
                  ล้าง
                </button>
              </div>

              <div className="max-h-52 overflow-y-auto pr-0.5">
                {shown.map((o) => (
                  <label
                    key={o}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(o)}
                      onChange={() => toggleVal(o)}
                      className="accent-brand-600"
                    />
                    <span className="truncate">{o}</span>
                  </label>
                ))}
                {shown.length === 0 && (
                  <div className="text-xs text-slate-400 px-1 py-2">ไม่พบค่า</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </th>
  );
}

function AckButton({
  locked,
  byMe,
  byName,
  onClick,
  pending,
}: {
  locked: boolean;
  byMe: boolean;
  byName: string | null;
  onClick: () => void;
  pending: boolean;
}) {
  if (locked) {
    return (
      <div
        className="inline-flex w-9 h-9 items-center justify-center rounded-full cursor-default bg-emerald-600 text-white"
        title={byMe ? "รับทราบแล้ว โดยคุณ" : `รับทราบแล้วโดย ${byName ?? "-"}`}
      >
        <CheckCircle2 size={18} />
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="inline-flex w-9 h-9 items-center justify-center rounded-full border transition bg-white text-slate-500 border-slate-300 hover:border-brand-500 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      title="คลิกเพื่อกดรับทราบ"
    >
      <Check size={18} />
    </button>
  );
}

function fmtDate(date?: string | null) {
  return date ? new Date(date).toLocaleDateString("th-TH-u-ca-gregory") : "-";
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-slate-300 text-xs">-</span>;
  const cls =
    {
      Pending: "bg-amber-100 text-amber-800 border border-amber-300",
      Passed: "bg-emerald-100 text-emerald-800 border border-emerald-300",
      Failed: "bg-rose-100 text-rose-800 border border-rose-300",
    }[status] ?? "bg-slate-200 text-slate-700 border border-slate-300";
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type?: string }) {
  if (!type) return <span className="text-slate-300 text-xs">-</span>;
  const cls =
    {
      Standard: "bg-blue-100 text-blue-700 border border-blue-300",
      Modify: "bg-amber-100 text-amber-800 border border-amber-300",
      "Add-on": "bg-indigo-100 text-indigo-800 border border-indigo-300",
    }[type] ?? "bg-slate-200 text-slate-700 border border-slate-300";
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
      {type}
    </span>
  );
}

function FileList({
  files,
  onDownload,
}: {
  files: { id: string; name: string; kind: string }[];
  onDownload: (fileId: string, name: string) => void;
}) {
  if (files.length === 0) {
    return <span className="text-slate-300 text-xs">ไม่มีไฟล์</span>;
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {files.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onDownload(f.id, f.name)}
          title={`${f.name}${f.kind && f.kind !== "ATTACHMENT" ? ` · ${f.kind}` : ""}`}
          aria-label={`ดาวน์โหลด ${f.name}`}
          className="shrink-0 rounded-md transition-transform hover:scale-110"
        >
          <FileTypeIcon type={fileExtType(f.name)} />
        </button>
      ))}
    </div>
  );
}

function fileExtType(name: string): "pdf" | "image" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"].includes(ext)) return "image";
  return "other";
}

/** Colored file-type glyph based on the file extension (PDF = red, image = blue). */
function FileTypeIcon({ type }: { type: "pdf" | "image" | "other" }) {
  if (type === "pdf") {
    return (
      <svg width="26" height="26" viewBox="0 0 32 32" className="block">
        <path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#EF4444" />
        <path d="M19 3l7 7h-7V3z" fill="#B91C1C" />
        <text x="15" y="25" textAnchor="middle" fontSize="8" fontWeight={800} fontFamily="Arial, sans-serif" fill="#fff">
          PDF
        </text>
      </svg>
    );
  }
  if (type === "image") {
    return (
      <svg width="26" height="26" viewBox="0 0 32 32" className="block">
        <path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#0EA5E9" />
        <path d="M19 3l7 7h-7V3z" fill="#0369A1" />
        <circle cx="11" cy="15" r="1.9" fill="#fff" />
        <path d="M8 25 L13 18 L16 21.5 L20 16 L24 25 Z" fill="#fff" />
      </svg>
    );
  }
  // Any non-PDF file type → blue document icon.
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" className="block">
      <path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#0EA5E9" />
      <path d="M19 3l7 7h-7V3z" fill="#0369A1" />
    </svg>
  );
}
