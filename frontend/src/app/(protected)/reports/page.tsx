"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet, FileText, Download, ChevronDown, Check, CalendarDays, Filter, Layers,
  Files, CircleCheck, Clock, Hourglass, ChevronLeft, ChevronRight,
} from "lucide-react";
import { documentApi, settingsApi, type DocumentSummary } from "@/lib/api/endpoints";
import { MusicLoader } from "@/components/MusicLoader";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

const DASH = "—";
const DAY = 86_400_000;
const DEFAULT_WARN = 8;
const DEFAULT_LATE = 30;

type ViewType = "both" | "uai" | "uat";
type Kind = "uai" | "uat";
type DateMode = "all" | "7" | "30" | "90" | "custom";
type MenuKey = "view" | "status" | "date" | "export";

function fmtDate(v?: string | null): string {
  return v ? new Date(v).toLocaleDateString("th-TH") : DASH;
}
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY);
}

type Aging = { value: number | null; locked: boolean; note?: string };

function computeAging(d: DocumentSummary, kind: Kind): Aging {
  if (!d.install_date) return { value: null, locked: false, note: "ไม่มีวันติดตั้ง" };
  const install = new Date(d.install_date);
  const status = kind === "uai" ? d.uai_status : d.uat_status;
  const date = kind === "uai" ? d.uai_date : d.uat_date;
  if (status === "Passed") {
    if (!date) return { value: null, locked: true, note: `Passed แต่ไม่มีวัน ${kind.toUpperCase()}` };
    return { value: Math.max(0, calDays(install, new Date(date))), locked: true };
  }
  return { value: Math.max(0, calDays(install, new Date())), locked: false };
}

function agingCls(a: Aging, warn: number, late: number): string {
  if (a.value === null) return "";
  if (a.locked) return "bg-emerald-50 text-emerald-700";
  if (a.value >= late) return "bg-rose-50 text-rose-700";
  if (a.value >= warn) return "bg-amber-50 text-amber-700";
  return "bg-brand-50 text-brand-700";
}

const STATUS_CLS: Record<string, string> = {
  Passed: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  Pending: "bg-amber-100 text-amber-800 border border-amber-300",
  Failed: "bg-rose-100 text-rose-800 border border-rose-300",
};
function StatusPill({ status }: { status?: string }) {
  if (!status) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_CLS[status] ?? "bg-slate-200 text-slate-700 border border-slate-300")}>
      {status}
    </span>
  );
}

export default function ReportsPage() {
  const toast = useToast();
  const q = useQuery({ queryKey: ["documents", "all"], queryFn: () => documentApi.list({ size: 500 }) });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });

  const warn = Number(settingsQ.data?.report_aging?.warn_days ?? DEFAULT_WARN);
  const late = Number(settingsQ.data?.report_aging?.late_days ?? DEFAULT_LATE);

  const [view, setView] = useState<ViewType>("both");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const kind: Kind = view === "uai" ? "uai" : "uat";
  const showUai = view !== "uat";
  const showUat = view !== "uai";

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pickPreset(m: DateMode) {
    setDateMode(m);
    if (m === "all") { setFrom(""); setTo(""); setMenu(null); }
    else if (m !== "custom") {
      const today = new Date();
      const start = new Date();
      start.setDate(today.getDate() - (Number(m) - 1));
      setFrom(isoLocal(start));
      setTo(isoLocal(today));
      setMenu(null);
    }
  }

  const base = q.data?.data ?? [];

  const rows = useMemo(() => {
    return base.filter((d) => {
      if (from && (!d.install_date || d.install_date.slice(0, 10) < from)) return false;
      if (to && (!d.install_date || d.install_date.slice(0, 10) > to)) return false;
      if (statusFilter) {
        const s = kind === "uai" ? d.uai_status : d.uat_status;
        if ((s ?? "") !== statusFilter) return false;
      }
      return true;
    });
  }, [base, from, to, statusFilter, kind]);

  const stats = useMemo(() => {
    let passed = 0, running = 0, sum = 0, sumCount = 0;
    for (const d of rows) {
      const s = kind === "uai" ? d.uai_status : d.uat_status;
      const a = computeAging(d, kind);
      if (s === "Passed") passed++;
      else running++;
      if (a.locked && a.value !== null) { sum += a.value; sumCount++; }
    }
    return { total: rows.length, passed, running, avg: sumCount ? Math.round(sum / sumCount) : null };
  }, [rows, kind]);

  // Pagination (same 10-per-page pattern as the Documents list).
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [page, setPage] = useState(1);
  const totalItems = rows.length;
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = pageSize === "all" ? 0 : (currentPage - 1) * pageSize;
  const pageRows = pageSize === "all" ? rows : rows.slice(offset, offset + pageSize);
  // Reset to page 1 whenever the filtered set or page size changes.
  useEffect(() => {
    setPage(1);
  }, [view, statusFilter, dateMode, from, to, pageSize]);

  type Col = { header: string; get: (d: DocumentSummary) => string | number };
  const exportCols: Col[] = useMemo(() => {
    const cols: Col[] = [
      { header: "บริษัท", get: (d) => d.company_name?.trim() || DASH },
      { header: "ผู้รับผิดชอบ", get: (d) => d.owner_project_name?.trim() || DASH },
      { header: "วันที่ติดตั้ง", get: (d) => fmtDate(d.install_date) },
    ];
    if (showUai) cols.push({ header: "สถานะ UAI", get: (d) => d.uai_status || DASH }, { header: "วันที่ UAI", get: (d) => fmtDate(d.uai_date) });
    if (showUat) cols.push({ header: "สถานะ UAT", get: (d) => d.uat_status || DASH }, { header: "วันที่ UAT", get: (d) => fmtDate(d.uat_date) });
    cols.push({ header: "จำนวนวัน", get: (d) => { const a = computeAging(d, kind); return a.value === null ? DASH : a.value; } });
    return cols;
  }, [showUai, showUat, kind]);

  const viewLabel = view === "uai" ? "UAI" : view === "uat" ? "UAT" : "ทั้งหมด";
  const dateLabel =
    dateMode === "all" ? "ทั้งหมด"
      : dateMode === "custom" ? (from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : "กำหนดเอง")
        : `${dateMode} วันล่าสุด`;
  const colSpan = 1 + exportCols.length;

  async function exportExcel() {
    setMenu(null);
    const XLSX = await import("xlsx");
    const aoa = [exportCols.map((c) => c.header), ...rows.map((d) => exportCols.map((c) => c.get(d)))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = exportCols.map((c) => ({ wch: c.header.includes("บริษัท") || c.header.includes("ผู้รับผิดชอบ") ? 22 : 13 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `รายงาน ${viewLabel}`);
    XLSX.writeFile(wb, `report_${view}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPDF() {
    setMenu(null);
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("เบราว์เซอร์บล็อกป๊อปอัป — กรุณาอนุญาต popup แล้วลองใหม่");
      return;
    }
    // Text columns left-aligned; dates/status/number centered. Header + cell share the align so they line up.
    const alignOf = (h: string) => (h === "บริษัท" || h === "ผู้รับผิดชอบ" ? "l" : "c");
    const head = exportCols.map((c) => `<th class="${alignOf(c.header)}">${c.header}</th>`).join("");
    const body = rows
      .map((d) => `<tr>${exportCols.map((c) => `<td class="${alignOf(c.header)}">${c.get(d)}</td>`).join("")}</tr>`)
      .join("");
    const range = from || to ? `${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}` : "ทั้งหมด";
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>รายงานเอกสาร ${viewLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet">
<style>
*{font-family:'Sarabun','Leelawadee UI','Tahoma',sans-serif}
body{margin:24px;color:#0f172a}
h1{font-size:18px;margin:0 0 4px}
.sub{font-size:12px;color:#64748b;margin:0 0 16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #cbd5e1;padding:6px 10px;vertical-align:middle}
th{background:#eff4fe;font-weight:600}
.l{text-align:left}
.c{text-align:center}
@media print{@page{size:landscape;margin:12mm}}
</style></head><body>
<h1>รายงานเอกสาร (${viewLabel})</h1>
<p class="sub">ช่วงวันติดตั้ง: ${range} · ทั้งหมด ${rows.length} รายการ · พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`);
    w.document.close();
  }

  const toggle = (k: MenuKey) => setMenu((m) => (m === k ? null : k));

  return (
    <div className="space-y-6">
      {/* Toolbar — chip filters */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500 pt-2">รายงานเอกสารและระยะเวลาดำเนินการ</p>
        <div ref={barRef} className="flex items-center gap-2 flex-wrap">
          {/* ประเภท */}
          <div className="relative">
            <Chip icon={Layers} label="ประเภท" value={viewLabel} active={view !== "both"} open={menu === "view"} onClick={() => toggle("view")} />
            {menu === "view" && (
              <Menu>
                {([["both", "ทั้งหมด"], ["uai", "UAI"], ["uat", "UAT"]] as [ViewType, string][]).map(([v, l]) => (
                  <MenuItem key={v} selected={view === v} onClick={() => { setView(v); setMenu(null); }}>{l}</MenuItem>
                ))}
              </Menu>
            )}
          </div>
          {/* สถานะ */}
          <div className="relative">
            <Chip icon={Filter} label={`สถานะ ${kind.toUpperCase()}`} value={statusFilter || "ทั้งหมด"} active={!!statusFilter} open={menu === "status"} onClick={() => toggle("status")} />
            {menu === "status" && (
              <Menu>
                {["", "Passed", "Pending", "Failed"].map((s) => (
                  <MenuItem key={s} selected={statusFilter === s} onClick={() => { setStatusFilter(s); setMenu(null); }}>{s || "ทั้งหมด"}</MenuItem>
                ))}
              </Menu>
            )}
          </div>
          {/* ช่วงวันติดตั้ง */}
          <div className="relative">
            <Chip icon={CalendarDays} label="ช่วง" value={dateLabel} active={dateMode !== "all"} open={menu === "date"} onClick={() => toggle("date")} />
            {menu === "date" && (
              <Menu className="w-56">
                {([["all", "ทั้งหมด"], ["7", "7 วันล่าสุด"], ["30", "30 วันล่าสุด"], ["90", "90 วันล่าสุด"], ["custom", "กำหนดเอง"]] as [DateMode, string][]).map(([m, l]) => (
                  <MenuItem key={m} selected={dateMode === m} onClick={() => pickPreset(m)}>{l}</MenuItem>
                ))}
                {dateMode === "custom" && (
                  <div className="px-3 pt-2 pb-1 border-t border-slate-100 mt-1 space-y-2">
                    <label className="block text-xs text-slate-500">จากวันที่
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 h-9 text-sm" />
                    </label>
                    <label className="block text-xs text-slate-500">ถึงวันที่
                      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 h-9 text-sm" />
                    </label>
                  </div>
                )}
              </Menu>
            )}
          </div>
          {/* ส่งออก */}
          <div className="relative">
            <button
              onClick={() => toggle("export")}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Download size={15} />
              ส่งออก
              <ChevronDown size={14} className={cn("transition-transform", menu === "export" && "rotate-180")} />
            </button>
            {menu === "export" && (
              <Menu align="right" className="w-52">
                <button onClick={exportExcel} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-brand-50">
                  <FileSpreadsheet size={16} className="text-emerald-600" />Excel (.xlsx)
                </button>
                <button onClick={exportPDF} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-brand-50">
                  <FileText size={16} className="text-rose-600" />PDF
                </button>
              </Menu>
            )}
          </div>
        </div>
      </div>

      {q.isLoading ? (
        <div className="card"><MusicLoader /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Files} label="เอกสารทั้งหมด" value={stats.total} />
            <StatCard icon={CircleCheck} label={`${kind.toUpperCase()} ผ่านแล้ว`} value={stats.passed} color="text-emerald-600" />
            <StatCard icon={Clock} label="กำลังดำเนินการ" value={stats.running} color="text-amber-600" />
            <StatCard icon={Hourglass} label="เฉลี่ยวันจนผ่าน" value={stats.avg === null ? "—" : stats.avg} suffix={stats.avg === null ? "" : " วัน"} />
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-brand-50/60 text-slate-900 text-left text-sm [&_th]:whitespace-nowrap">
                  <tr>
                    <th className="px-3 py-3 font-semibold w-10 text-center"></th>
                    <th className="px-3 py-3 font-semibold">บริษัท</th>
                    <th className="px-3 py-3 font-semibold">ผู้รับผิดชอบ</th>
                    <th className="px-3 py-3 font-semibold">วันที่ติดตั้ง</th>
                    {showUai && <th className="px-3 py-3 font-semibold">สถานะ UAI</th>}
                    {showUai && <th className="px-3 py-3 font-semibold">วันที่ UAI</th>}
                    {showUat && <th className="px-3 py-3 font-semibold">สถานะ UAT</th>}
                    {showUat && <th className="px-3 py-3 font-semibold">วันที่ UAT</th>}
                    <th className="px-3 py-3 font-semibold text-center">จำนวนวัน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-slate-400">ไม่พบข้อมูลตามเงื่อนไข</td>
                    </tr>
                  )}
                  {pageRows.map((d, i) => {
                    const a = computeAging(d, kind);
                    return (
                      <tr key={d.id} className="border-t border-slate-100 hover:bg-brand-50/30 align-middle">
                        <td className="px-3 py-3 text-center text-slate-500 text-sm">{offset + i + 1}</td>
                        <td className="px-3 py-3 text-brand-700 font-medium whitespace-nowrap text-[15px]">{d.company_name || DASH}</td>
                        <td className="px-3 py-3 text-slate-700 text-sm whitespace-nowrap">{d.owner_project_name || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-3 text-slate-600 text-sm whitespace-nowrap">{fmtDate(d.install_date)}</td>
                        {showUai && <td className="px-3 py-3"><StatusPill status={d.uai_status} /></td>}
                        {showUai && <td className="px-3 py-3 text-slate-600 text-sm whitespace-nowrap">{fmtDate(d.uai_date)}</td>}
                        {showUat && <td className="px-3 py-3"><StatusPill status={d.uat_status} /></td>}
                        {showUat && <td className="px-3 py-3 text-slate-600 text-sm whitespace-nowrap">{fmtDate(d.uat_date)}</td>}
                        <td className="px-3 py-3 text-center">
                          {a.value === null ? (
                            <span className="text-slate-300 font-bold" title={a.note}>—</span>
                          ) : (
                            <span className={cn("inline-flex items-center justify-center min-w-[38px] px-2.5 py-1 rounded-lg text-sm font-bold", agingCls(a, warn, late))} title={a.locked ? "ผ่านแล้ว (ล็อกค่า)" : "กำลังนับ"}>
                              {a.value}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
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
                <span>รายการ · ทั้งหมด {totalItems}</span>
              </div>
              {pageSize !== "all" && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="ก่อนหน้า"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="tabular-nums px-1">
                    หน้า {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="ถัดไป"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
            <div className="px-4 pb-3 -mt-1 text-xs text-slate-400">
              จำนวนวันนับถึง {kind.toUpperCase()} = Passed · เกณฑ์สี: เหลือง ≥ {warn} วัน · แดง ≥ {late} วัน (ตั้งค่าที่หน้า Settings)
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  icon: Icon, label, value, active, open, onClick,
}: {
  icon: React.ElementType; label: string; value: string; active: boolean; open: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-sm transition-colors",
        active ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      <Icon size={15} className={active ? "text-brand-600" : "text-slate-400"} />
      <span className={active ? "text-brand-400" : "text-slate-400"}>{label}</span>
      <span className={cn("font-semibold", active ? "text-brand-700" : "text-slate-800")}>{value}</span>
      <ChevronDown size={14} className={cn("text-slate-300 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function Menu({ children, align = "left", className }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <div className={cn("absolute mt-1.5 min-w-[168px] bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-30", align === "right" ? "right-0" : "left-0", className)}>
      {children}
    </div>
  );
}

function MenuItem({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-brand-50">
      <span className={cn(selected && "text-brand-700 font-semibold")}>{children}</span>
      {selected && <Check size={15} className="text-brand-600" />}
    </button>
  );
}

function StatCard({
  icon: Icon, label, value, color, suffix,
}: {
  icon: React.ElementType; label: string; value: number | string; color?: string; suffix?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1.5">
        <Icon size={14} /> {label}
      </div>
      <div className={cn("text-2xl font-bold", color)}>
        {value}
        {suffix && <span className="text-sm font-medium text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}
