"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  UserCheck,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Calendar,
  BellRing,
  Check,
  Percent,
  Lightbulb,
  X,
} from "lucide-react";
import {
  authApi,
  dashboardApi,
  documentApi,
  settingsApi,
  type DashboardData,
  type DocumentSummary,
} from "@/lib/api/endpoints";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { Tooltip } from "@/components/Tooltip";
import { cn, serverToday } from "@/lib/utils";

const DAY = 86_400_000;

function calDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY);
}

export default function DashboardPage() {
  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const dQ = useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardApi.get,
    refetchInterval: 60_000,
  });
  // Reuse the documents list (same pattern as /reports) to build the action queue
  // without a new backend endpoint. DocumentSummary already carries ack_count +
  // created_at + files_count — everything the queue needs.
  // Shares the cache with the documents page (same key + same {data, meta} shape).
  // Must return the full response — the documents page reads q.data.data, so a
  // different shape here would corrupt that page's cache and vice-versa.
  const docsQ = useQuery({
    queryKey: ["documents", "all"],
    queryFn: documentApi.listAll,
    staleTime: 30_000,
  });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });

  const today = new Date().toLocaleDateString("th-TH-u-ca-gregory", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const d = dQ.data;
  const warn = settingsQ.data?.report_aging?.warn_days ?? 8;
  const late = settingsQ.data?.report_aging?.late_days ?? 30;

  // "วันนี้" ตามนาฬิกา server (meta.server_date) — ใช้กับ day-count ทุกจุดแทนนาฬิกา client
  const srvToday = useMemo(
    () => serverToday(docsQ.data?.meta?.server_date),
    [docsQ.data?.meta?.server_date]
  );

  const uaiRate = useMemo(() => {
    const u = d?.statuses.uai;
    if (!u) return null;
    const total = u.pending + u.passed + u.failed;
    return total > 0 ? Math.round((u.passed / total) * 100) : null;
  }, [d]);

  // Which KPI's "ตรวจสอบข้อมูลเบื้องต้น" modal is open (null = closed).
  const [kpiOpen, setKpiOpen] = useState<KpiKind | null>(null);

  return (
    <div className="space-y-5">
      {/* Header — greeting + human summary sentence */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{today}</span>
            {meQ.data?.position && (
              <>
                <span className="text-slate-300">·</span>
                <span>{meQ.data.position.name}</span>
              </>
            )}
            {meQ.data?.departments?.map((dept) => (
              <span
                key={dept.id}
                className="bg-brand-50 text-brand-700 rounded px-1.5 py-0.5 text-xs font-mono"
              >
                {dept.code}
              </span>
            ))}
          </div>
          <h1 className="text-xl font-bold tracking-tight mt-1.5">
            <span className="mr-1">👋</span>
            สวัสดี, {meQ.data?.full_name ?? "..."}
            {(d?.pending_ack ?? 0) > 0 && (
              <span className="font-normal text-slate-600">
                {" — มีเอกสารรอการรับทราบ "}
                <span className="text-amber-600 font-semibold">{d?.pending_ack}</span>
                {" ฉบับ"}
              </span>
            )}
          </h1>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={FileText}
          tone="brand"
          label="เอกสารทั้งหมด"
          value={d?.total ?? 0}
          hint={d && <TrendBadge pct={d.trend_pct} isNew={d.trend_is_new} count={d.this_week} />}
          onClick={() => setKpiOpen("total")}
        />
        <KpiCard
          icon={UserCheck}
          tone="emerald"
          label="ของฉัน (อัปโหลด)"
          value={d?.mine ?? 0}
          hint={<>{d?.this_week ?? 0} ทั้งระบบสัปดาห์นี้</>}
          onClick={() => setKpiOpen("mine")}
        />
        <KpiCard
          icon={Percent}
          tone="indigo"
          label="อัตราผ่าน UAI"
          value={uaiRate ?? 0}
          suffix="%"
          hint={
            <>
              ผ่าน {d?.statuses.uai.passed ?? 0} จาก{" "}
              {(d?.statuses.uai.pending ?? 0) +
                (d?.statuses.uai.passed ?? 0) +
                (d?.statuses.uai.failed ?? 0)}
            </>
          }
          onClick={() => setKpiOpen("uai")}
        />
        <KpiCard
          icon={CheckCircle2}
          tone="amber"
          label="รับทราบวันนี้"
          value={d?.acked_today ?? 0}
          hint={<>รวมทั้งระบบวันนี้</>}
          onClick={() => setKpiOpen("ack")}
        />
      </div>

      {/* Row 1 — action queue (hero) ‖ UAT/UAI status bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ActionQueue
            docs={docsQ.data?.data ?? []}
            loading={docsQ.isLoading}
            warn={warn}
            late={late}
            today={srvToday}
          />
        </div>
        <section className="card p-5">
          <h2 className="text-base font-semibold text-slate-700 mb-4">สถานะ · UAT / UAI</h2>
          <StatusBars
            uat={d?.statuses.uat ?? { pending: 0, passed: 0, failed: 0 }}
            uai={d?.statuses.uai ?? { pending: 0, passed: 0, failed: 0 }}
          />
        </section>
      </div>

      {/* Row 2 — docs per day (with prev-week compare) ‖ activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DocsPerDayCard />
        <section className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-slate-700">กิจกรรมล่าสุด</h2>
            <Link
              href="/documents"
              className="text-xs text-slate-500 hover:text-brand-700 inline-flex items-center gap-1"
            >
              ดูทั้งหมด <ArrowUpRight size={12} />
            </Link>
          </div>
          <p className="text-xs text-slate-500 mb-5">การเคลื่อนไหวของเอกสารล่าสุด</p>
          <ActivityTimeline items={d?.activity ?? []} loading={dQ.isLoading} />
        </section>
      </div>

      {kpiOpen && (
        <KpiCheckModal
          kind={kpiOpen}
          onClose={() => setKpiOpen(null)}
          docs={docsQ.data?.data ?? []}
          d={d}
          meId={meQ.data?.id}
          uaiRate={uaiRate}
          warn={warn}
          late={late}
          today={srvToday}
        />
      )}
    </div>
  );
}

/* -------- KPI Card (solid tile + watermark icon) -------- */

const KPI_TONES = {
  brand: {
    bg: "bg-brand-700",
    shadow: "shadow-lg shadow-brand-700/25",
    label: "text-white",
    chip: "text-brand-800",
  },
  emerald: {
    bg: "bg-emerald-700",
    shadow: "shadow-lg shadow-emerald-700/25",
    label: "text-white",
    chip: "text-emerald-800",
  },
  indigo: {
    bg: "bg-indigo-600",
    shadow: "shadow-lg shadow-indigo-600/25",
    label: "text-white",
    chip: "text-indigo-800",
  },
  amber: {
    bg: "bg-amber-600",
    shadow: "shadow-lg shadow-amber-600/25",
    label: "text-white",
    chip: "text-amber-900",
  },
} as const;
type KpiTone = keyof typeof KPI_TONES;

function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  suffix,
  hint,
  onClick,
}: {
  icon: React.ElementType;
  tone: KpiTone;
  label: string;
  value: number;
  suffix?: string;
  /** Rendered inside a white pill chip — pass content only, no styling. */
  hint?: React.ReactNode;
  /** Opens the per-KPI "ตรวจสอบข้อมูลเบื้องต้น" modal. */
  onClick?: () => void;
}) {
  const t = KPI_TONES[tone];
  return (
    <Tooltip label="คลิกเพื่อตรวจสอบข้อมูลเบื้องต้น" className="w-full">
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl p-5 block w-full text-left transition-transform hover:-translate-y-0.5",
        t.bg,
        t.shadow
      )}
    >
      {/* Oversized faint icon anchored to the corner — the "แบบ 1" watermark. */}
      <Icon
        size={84}
        aria-hidden
        className="absolute -right-3 -bottom-4 text-white/10 pointer-events-none"
      />
      <div className="flex items-start justify-between gap-2 min-h-[24px]">
        <div className={cn("text-xs font-medium", t.label)}>{label}</div>
        <ArrowUpRight size={16} className="text-white/60 group-hover:text-white transition-colors" />
      </div>
      <div className="text-3xl font-bold mt-1 tracking-tight text-white">
        {value.toLocaleString()}
        {suffix && <span className="text-lg text-white/90 ml-0.5">{suffix}</span>}
      </div>
      {hint && (
        <div
          className={cn(
            "relative mt-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-medium",
            t.chip
          )}
        >
          {hint}
        </div>
      )}
    </button>
    </Tooltip>
  );
}

/* -------- KPI drill-down modal (ตรวจสอบข้อมูลเบื้องต้น) -------- */

type KpiKind = "total" | "mine" | "uai" | "ack";

const KPI_MODAL_META: Record<KpiKind, { title: string; icon: React.ElementType; iconCls: string }> = {
  total: { title: "ตรวจสอบ · เอกสารทั้งหมด", icon: FileText, iconCls: "bg-brand-50 text-brand-700" },
  mine: { title: "ตรวจสอบ · ของฉัน (อัปโหลด)", icon: UserCheck, iconCls: "bg-emerald-50 text-emerald-700" },
  uai: { title: "ตรวจสอบ · อัตราผ่าน UAI", icon: Percent, iconCls: "bg-indigo-50 text-indigo-700" },
  ack: { title: "ตรวจสอบ · รับทราบวันนี้", icon: CheckCircle2, iconCls: "bg-amber-50 text-amber-700" },
};

const fmtThDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("th-TH-u-ca-gregory") : "—";
const isSameDay = (v: string | null | undefined, today: Date) => {
  if (!v) return false;
  const a = new Date(v);
  return (
    a.getFullYear() === today.getFullYear() &&
    a.getMonth() === today.getMonth() &&
    a.getDate() === today.getDate()
  );
};

type ModalRow = { id: string; name: string; right: React.ReactNode };
type ModalBar = { label: string; color: string; count: number };

function KpiCheckModal({
  kind,
  onClose,
  docs,
  d,
  meId,
  uaiRate,
  warn,
  late,
  today,
}: {
  kind: KpiKind;
  onClose: () => void;
  docs: DocumentSummary[];
  d?: DashboardData;
  meId?: string;
  uaiRate: number | null;
  warn: number;
  late: number;
  today: Date;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = KPI_MODAL_META[kind];
  const Icon = meta.icon;

  const content = useMemo(() => {
    const stats: { v: React.ReactNode; l: string }[] = [];
    const bars: ModalBar[] = [];
    const sections: { title: string; rows: ModalRow[]; empty: string }[] = [];
    const name = (x: DocumentSummary) => x.company_name?.trim() || x.title || x.code;

    if (kind === "total") {
      const withFiles = docs.filter((x) => (x.files_count ?? 0) > 0).length;
      stats.push(
        { v: d?.total ?? docs.length, l: "ทั้งหมด" },
        { v: <span className="text-emerald-600">+{d?.this_week ?? 0}</span>, l: "สัปดาห์นี้" },
        { v: withFiles, l: "มีไฟล์แนบ" }
      );
      const byType = (t: string) => docs.filter((x) => (x.project_type || "Standard") === t).length;
      bars.push(
        { label: "Standard", color: "#378ADD", count: byType("Standard") },
        { label: "Modify", color: "#1D9E75", count: byType("Modify") },
        { label: "Add-on", color: "#7F77DD", count: byType("Add-on") }
      );
      sections.push({
        title: "เอกสารล่าสุด",
        rows: docs.slice(0, 5).map((x) => ({
          id: x.id,
          name: name(x),
          right: <span className="text-slate-600">{fmtThDate(x.created_at)}</span>,
        })),
        empty: "— ยังไม่มีเอกสาร —",
      });
    } else if (kind === "mine") {
      const mine = docs.filter((x) => !!meId && x.owner_user_id === meId);
      const total = docs.length || 1;
      const noStatus = mine.filter((x) => !x.uat_status).length;
      stats.push(
        { v: d?.mine ?? mine.length, l: "ของฉัน" },
        { v: `${Math.round(((d?.mine ?? mine.length) / total) * 100)}%`, l: "ของทั้งระบบ" },
        { v: <span className="text-amber-600">{noStatus}</span>, l: "ยังไม่ระบุสถานะ" }
      );
      const st = (s: string) => mine.filter((x) => x.uat_status === s).length;
      bars.push(
        { label: "Passed", color: "#1D9E75", count: st("Passed") },
        { label: "Pending", color: "#EF9F27", count: st("Pending") },
        { label: "Failed", color: "#E24B4A", count: st("Failed") },
        { label: "ไม่ระบุ", color: "#B4B2A9", count: noStatus }
      );
      sections.push({
        title: "อัปโหลดล่าสุดของฉัน",
        rows: mine.slice(0, 5).map((x) => ({
          id: x.id,
          name: name(x),
          right: <span className="text-slate-600">{fmtThDate(x.created_at)}</span>,
        })),
        empty: "— ยังไม่มีเอกสารของฉัน —",
      });
    } else if (kind === "uai") {
      const u = d?.statuses.uai ?? { pending: 0, passed: 0, failed: 0 };
      const withStatus = u.pending + u.passed + u.failed;
      const unspecified = (d?.total ?? docs.length) - withStatus;
      stats.push(
        { v: <span className="text-indigo-600">{uaiRate ?? 0}%</span>, l: "อัตราผ่าน" },
        { v: `${u.passed} / ${withStatus}`, l: "ผ่าน / มีสถานะ" },
        { v: unspecified, l: "ยังไม่ระบุ" }
      );
      bars.push(
        { label: "Passed", color: "#1D9E75", count: u.passed },
        { label: "Pending", color: "#EF9F27", count: u.pending },
        { label: "Failed", color: "#E24B4A", count: u.failed }
      );
      sections.push({
        title: "ค้างดำเนินการ (Pending / Failed)",
        rows: docs
          .filter((x) => x.uai_status === "Pending" || x.uai_status === "Failed")
          .slice(0, 5)
          .map((x) => ({
            id: x.id,
            name: name(x),
            right: (
              <span
                className={cn(
                  "text-[10px] font-medium rounded-full px-1.5 py-0.5",
                  x.uai_status === "Failed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                )}
              >
                {x.uai_status}
              </span>
            ),
          })),
        empty: "— ไม่มีรายการค้าง —",
      });
    } else {
      const ackedToday = docs.filter((x) => isSameDay(x.acknowledged_at, today));
      const ackedAll = docs.filter((x) => (x.ack_count ?? 0) > 0).length;
      stats.push(
        { v: d?.acked_today ?? ackedToday.length, l: "รับทราบวันนี้" },
        { v: ackedAll, l: "รับทราบแล้วทั้งหมด" },
        { v: <span className="text-rose-600">{d?.pending_ack ?? 0}</span>, l: "รอรับทราบ" }
      );
      sections.push({
        title: "รายการรับทราบวันนี้",
        rows: ackedToday.slice(0, 5).map((x) => ({
          id: x.id,
          name: name(x),
          right: (
            <span className="text-slate-600">
              {x.acknowledged_by_name ?? ""}{" "}
              {x.acknowledged_at
                ? new Date(x.acknowledged_at).toLocaleTimeString("th-TH-u-ca-gregory", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
                : ""}
            </span>
          ),
        })),
        empty: "— ยังไม่มีการรับทราบวันนี้ —",
      });
      const waiting = docs
        .filter((x) => (x.ack_count ?? 0) === 0)
        .map((x) => ({ x, days: calDays(new Date(x.created_at), today) }))
        .sort((a, b) => b.days - a.days)
        .slice(0, 5);
      sections.push({
        title: "รอรับทราบนานสุด",
        rows: waiting.map(({ x, days }) => ({
          id: x.id,
          name: name(x),
          right: (
            <span
              className={cn(
                "text-[10px] font-medium rounded-full px-1.5 py-0.5",
                days >= late
                  ? "bg-rose-50 text-rose-700"
                  : days >= warn
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-600"
              )}
            >
              {days} วัน
            </span>
          ),
        })),
        empty: "— ไม่มีเอกสารรอรับทราบ —",
      });
    }

    return { stats, bars, sections };
  }, [kind, docs, d, meId, uaiRate, warn, late, today]);

  const maxBar = Math.max(1, ...content.bars.map((b) => b.count));

  if (typeof document === "undefined") return null;

  // Portal ไป <body> (pattern เดียวกับ DatePicker/Tooltip/lightbox): กัน ancestor
  // ในเพจสร้าง containing block ให้ fixed เพี้ยน จน backdrop คลุมไม่เต็มจอ.
  // backdrop ใช้ -inset-8 เผื่อขอบ กัน blur เว้นแถบขาวริมจอ.
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-hidden"
      onClick={onClose}
    >
      <div className="absolute -inset-8 bg-slate-900/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-label={meta.title}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100">
          <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center", meta.iconCls)}>
            <Icon size={16} />
          </span>
          <span className="text-sm font-semibold text-slate-800 flex-1">{meta.title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-3 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {content.stats.map((s, i) => (
              <div key={i} className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                <div className="text-base font-bold text-slate-900">{s.v}</div>
                <div className="text-[10px] font-medium text-slate-600 mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>

          {content.bars.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {content.bars.map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-[11px] font-medium text-slate-800">
                  <span className="w-14 shrink-0">{b.label}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(b.count / maxBar) * 100}%`, background: b.color }}
                    />
                  </div>
                  <span className="w-6 text-right tabular-nums">{b.count}</span>
                </div>
              ))}
            </div>
          )}

          {content.sections.map((sec) => (
            <div key={sec.title}>
              <div className="text-[11px] font-semibold text-slate-600 mt-3 mb-1">{sec.title}</div>
              {sec.rows.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-3">{sec.empty}</div>
              ) : (
                sec.rows.map((r) => (
                  <Link
                    key={r.id}
                    href={`/documents/${r.id}`}
                    onClick={onClose}
                    className="flex items-center justify-between gap-2 py-1.5 border-t border-slate-50 text-xs hover:bg-slate-50 rounded px-1 -mx-1"
                  >
                    <span className="text-slate-900 truncate">{r.name}</span>
                    <span className="shrink-0">{r.right}</span>
                  </Link>
                ))
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-[11px] font-medium text-slate-600">
          <span>
            ข้อมูล ณ{" "}
            {new Date().toLocaleString("th-TH-u-ca-gregory", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <Link href="/documents" onClick={onClose} className="text-brand-600 font-medium hover:text-brand-700">
            ดูทั้งหมด →
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Rendered inside the KpiCard white chip — text colors only, no own background.
function TrendBadge({ pct, isNew, count }: { pct?: number; isNew?: boolean; count?: number }) {
  if (pct === undefined) return null;
  if (isNew) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <TrendingUp size={11} />
        +{count ?? 0} ใหม่สัปดาห์นี้
      </span>
    );
  }
  const up = pct >= 0;
  const rounded = Math.round(Math.abs(pct));
  return (
    <span className={cn("inline-flex items-center gap-1", up ? "text-emerald-700" : "text-rose-600")}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {rounded}% สัปดาห์นี้
    </span>
  );
}

/* -------- Action Queue (ต้องดำเนินการ) -------- */

function agingPillCls(days: number, warn: number, late: number): string {
  if (days >= late) return "bg-rose-50 text-rose-700";
  if (days >= warn) return "bg-amber-50 text-amber-700";
  return "bg-brand-50 text-brand-700";
}

const TYPE_LABEL: Record<string, string> = {
  Standard: "Standard",
  Modify: "Modify",
  "Add-on": "Add-on",
};

function ActionQueue({
  docs,
  loading,
  warn,
  late,
  today,
}: {
  docs: DocumentSummary[];
  loading: boolean;
  warn: number;
  late: number;
  today: Date;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const ackMut = useMutation({
    mutationFn: (id: string) => documentApi.acknowledge(id),
    onSuccess: () => {
      toast.success("บันทึกการรับทราบเรียบร้อยแล้ว");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "รับทราบไม่สำเร็จ";
      toast.error(msg);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
    },
  });

  async function onAck(id: string, company: string) {
    const ok = await confirm({
      title: "ยืนยันการรับทราบ",
      message: `บันทึกว่าได้รับทราบเอกสารของ "${company}" แล้ว?\n\n⚠ การรับทราบเป็นการล็อกถาวร ไม่สามารถยกเลิกได้\n(ทั้งเอกสารรับทราบได้ครั้งเดียว)`,
      confirmLabel: "รับทราบ",
      tone: "success",
    });
    if (ok) ackMut.mutate(id);
  }

  const queue = useMemo(
    () =>
      docs
        .filter((x) => x.ack_count === 0 && (x.files_count ?? x.files?.length ?? 0) > 0)
        .map((x) => ({ doc: x, days: calDays(new Date(x.created_at), today) }))
        .sort((a, b) => b.days - a.days),
    [docs, today]
  );
  const shown = queue.slice(0, 5);
  const rest = queue.length - shown.length;

  return (
    <section className="card p-5 border-amber-200 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <BellRing size={17} />
          </span>
          <h2 className="text-base font-semibold text-slate-700">
            ต้องดำเนินการ
            {queue.length > 0 && (
              <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                {queue.length}
              </span>
            )}
          </h2>
        </div>
        <Link
          href="/documents"
          className="text-xs text-slate-500 hover:text-brand-700 inline-flex items-center gap-1"
        >
          ดูทั้งหมด <ArrowUpRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>
      ) : shown.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">
          <CheckCircle2 size={26} className="mx-auto mb-2 text-emerald-400" />
          ไม่มีเอกสารที่ต้องดำเนินการ
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(({ doc, days }) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5"
            >
              <Link href={`/documents/${doc.id}`} className="flex-1 min-w-0 group">
                <div className="text-sm font-semibold text-slate-800 truncate group-hover:text-brand-700 transition-colors">
                  {doc.company_name || "-"}
                </div>
                <div className="text-xs text-slate-500 font-mono truncate">
                  {doc.work_order ? `WO ${doc.work_order}` : "ไม่มี WO"}
                  {doc.project_type && (
                    <>
                      <span className="mx-1 text-slate-300">·</span>
                      {TYPE_LABEL[doc.project_type] ?? doc.project_type}
                    </>
                  )}
                </div>
              </Link>
              <span
                className={cn(
                  "text-xs font-medium rounded-full px-2.5 py-1 whitespace-nowrap",
                  agingPillCls(days, warn, late)
                )}
              >
                ค้าง {days} วัน
              </span>
              <Tooltip label="กดรับทราบเอกสาร">
                <button
                  onClick={() => onAck(doc.id, doc.company_name || "-")}
                  disabled={ackMut.isPending}
                  className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  <Check size={14} />
                  รับทราบ
                </button>
              </Tooltip>
            </div>
          ))}
          {rest > 0 && (
            <div className="pt-1 text-center">
              <Link href="/documents" className="text-xs text-slate-500 hover:text-brand-700">
                และอีก {rest} ฉบับ →
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* -------- Documents per day (range filter + smooth area chart + compare) -------- */

const PRESETS = [7, 14, 30] as const;

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function DocsPerDayCard() {
  const [preset, setPreset] = useState<number | "custom">(7);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [customOpen, setCustomOpen] = useState(false);
  const customRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!customOpen) return;
    function onDoc(e: MouseEvent) {
      if (customRef.current && !customRef.current.contains(e.target as Node)) setCustomOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [customOpen]);

  const { from, to } = useMemo(() => {
    if (preset === "custom") {
      const today = isoLocal(new Date());
      return { from: customFrom || today, to: customTo || today };
    }
    const t = new Date();
    const f = new Date();
    f.setDate(t.getDate() - (preset - 1));
    return { from: isoLocal(f), to: isoLocal(t) };
  }, [preset, customFrom, customTo]);

  // Previous period of equal length, immediately before [from, to].
  const { prevFrom, prevTo } = useMemo(() => {
    const span = calDays(new Date(from), new Date(to)) + 1;
    const pTo = new Date(from);
    pTo.setDate(pTo.getDate() - 1);
    const pFrom = new Date(pTo);
    pFrom.setDate(pFrom.getDate() - (span - 1));
    return { prevFrom: isoLocal(pFrom), prevTo: isoLocal(pTo) };
  }, [from, to]);

  const q = useQuery({
    queryKey: ["dashboard-daily", from, to],
    queryFn: () => dashboardApi.daily(from, to),
    refetchInterval: 60_000,
  });
  const prevQ = useQuery({
    queryKey: ["dashboard-daily-prev", prevFrom, prevTo],
    queryFn: () => dashboardApi.daily(prevFrom, prevTo),
    refetchInterval: 60_000,
  });

  const data = q.data ?? [];
  const compare = prevQ.data ?? [];
  const total = data.reduce((s, x) => s + x.count, 0);
  const prevTotal = compare.reduce((s, x) => s + x.count, 0);
  const delta = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  // Simple client-side insight: the busiest day in range.
  const peak = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((m, x) => (x.count > m.count ? x : m), data[0]);
  }, [data]);

  return (
    <section className="lg:col-span-2 card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-700">เอกสารต่อวัน</h2>
          <div className="text-xs text-slate-500 mt-0.5">
            รวม {total} เอกสาร · {fmtRange(from, to)}
            {delta !== null && (
              <span className={cn("ml-1.5 font-medium", delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% เทียบช่วงก่อน
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                preset === p
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              )}
            >
              {p} วัน
            </button>
          ))}
          <div className="relative" ref={customRef}>
            <button
              onClick={() => {
                setPreset("custom");
                setCustomOpen((o) => !o);
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium border inline-flex items-center gap-1 transition-colors",
                preset === "custom"
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              )}
            >
              <Calendar size={12} /> กำหนดเอง
            </button>

            {preset === "custom" && customOpen && (
              <div className="absolute right-0 top-full mt-2 z-20 w-64 card p-3 shadow-xl shadow-slate-900/10 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="text-xs font-semibold text-slate-600 mb-2">เลือกช่วงวันที่</div>
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-[11px] text-slate-500">ตั้งแต่</span>
                    <div className="mt-0.5">
                      <DatePicker value={customFrom} max={customTo || undefined} onChange={setCustomFrom} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-slate-500">ถึง</span>
                    <div className="mt-0.5">
                      <DatePicker value={customTo} min={customFrom || undefined} onChange={setCustomTo} />
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AreaChart data={data} compare={compare} loading={q.isLoading} />

      {peak && peak.count > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
          <Lightbulb size={14} className="shrink-0" />
          <span>
            <span className="font-semibold">ข้อสังเกต:</span> {fullDay(peak.date)} มีเอกสารเข้ามากสุด{" "}
            {peak.count} ฉบับ
            {compare.length > 0 && (
              <span className="text-brand-600/70"> · เส้นประ = ช่วงก่อนหน้า</span>
            )}
          </span>
        </div>
      )}
    </section>
  );
}

function AreaChart({
  data,
  compare,
  loading,
}: {
  data: { date: string; count: number }[];
  compare?: { date: string; count: number }[];
  loading: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 210;
  const padL = 8;
  const padR = 8;
  const padT = 18;
  const padB = 26;
  const innerW = Math.max(1, w - padL - padR);
  const innerH = H - padT - padB;
  const n = data.length;
  const cmp = compare ?? [];
  // Share a Y-scale across both series so the compare line is fair.
  const max = Math.max(1, ...data.map((d) => d.count), ...cmp.map((d) => d.count));

  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
  const baseY = padT + innerH;

  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.count), v: d.count, date: d.date }));
  const line = smoothPath(pts.map((p) => ({ x: p.x, y: p.y })));
  const area = pts.length ? `${line} L ${pts[n - 1].x},${baseY} L ${pts[0].x},${baseY} Z` : "";
  // Compare line: align by index onto the same x positions (equal-length periods).
  const cmpPts = cmp.slice(0, n).map((d, i) => ({ x: xAt(i), y: yAt(d.count) }));
  const cmpLine = cmpPts.length > 1 ? smoothPath(cmpPts) : "";
  const grid = [0, 0.5, 1].map((f) => baseY - f * innerH);
  const labelIdx = sampleIndices(n, 7);
  const showDots = n <= 14;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = Math.abs(xAt(i) - mx);
      if (dx < bestD) {
        bestD = dx;
        best = i;
      }
    }
    setHover(best);
  }

  return (
    <div ref={wrapRef} className="relative" onMouseLeave={() => setHover(null)}>
      {loading ? (
        <div className="h-[210px] flex items-center justify-center text-sm text-slate-400">
          กำลังโหลด...
        </div>
      ) : n === 0 ? (
        <div className="h-[210px] flex items-center justify-center text-sm text-slate-400">
          ไม่มีข้อมูลในช่วงนี้
        </div>
      ) : (
        <>
          <svg width={w} height={H} onMouseMove={onMove} className="block overflow-visible">
            <defs>
              <linearGradient id="docAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
              </linearGradient>
            </defs>

            {grid.map((gy, i) => (
              <line key={i} x1={padL} y1={gy} x2={w - padR} y2={gy} stroke="#f1f5f9" strokeWidth={1} />
            ))}

            {cmpLine && (
              <path
                d={cmpLine}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {area && <path d={area} fill="url(#docAreaFill)" />}
            {line && (
              <path
                d={line}
                fill="none"
                stroke="#0284c7"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {showDots &&
              pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={hover === i ? 5 : 3}
                  fill="#fff"
                  stroke="#0284c7"
                  strokeWidth={2}
                />
              ))}

            {hover !== null && pts[hover] && (
              <>
                <line x1={pts[hover].x} y1={padT} x2={pts[hover].x} y2={baseY} stroke="#bae6fd" strokeWidth={1} />
                <circle cx={pts[hover].x} cy={pts[hover].y} r={5} fill="#0284c7" stroke="#fff" strokeWidth={2} />
              </>
            )}

            {labelIdx.map((i) => (
              <text
                key={i}
                x={xAt(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-slate-400"
                style={{ fontSize: 10 }}
              >
                {shortDay(data[i].date)}
              </text>
            ))}

            <text x={padL} y={padT - 6} className="fill-slate-300" style={{ fontSize: 10 }}>
              {max}
            </text>
          </svg>

          {hover !== null && pts[hover] && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 text-white px-2.5 py-1.5 shadow-lg whitespace-nowrap"
              style={{ left: pts[hover].x, top: pts[hover].y - 8 }}
            >
              <div className="text-xs font-semibold">{pts[hover].v} เอกสาร</div>
              <div className="text-[10px] text-white/70">{fullDay(data[hover].date)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function sampleIndices(n: number, maxLabels: number): number[] {
  if (n <= 0) return [];
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (maxLabels - 1);
  const out: number[] = [];
  for (let i = 0; i < maxLabels; i++) out.push(Math.round(i * step));
  return Array.from(new Set(out));
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });
}

function fullDay(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH-u-ca-gregory", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtRange(from: string, to: string): string {
  const f = new Date(from).toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });
  const t = new Date(to).toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" });
  return `${f} – ${t}`;
}

/* -------- UAT + UAI Status Bars -------- */

type StatusCount = { pending: number; passed: number; failed: number };

const COLORS = {
  pending: "#f59e0b",
  passed: "#059669",
  failed: "#e11d48",
};

const STATUS_LABEL: Record<keyof StatusCount, string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
};

const STATUS_KEYS = ["pending", "passed", "failed"] as const;

function StatusBars({ uat, uai }: { uat: StatusCount; uai: StatusCount }) {
  return (
    <div className="space-y-4">
      <StatusBar label="UAT" data={uat} />
      <StatusBar label="UAI" data={uai} />

      <div className="pt-3 border-t border-slate-100 space-y-1">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400 pr-1">
          <span className="flex-1" />
          <span className="w-9 text-right">UAT</span>
          <span className="w-9 text-right">UAI</span>
        </div>
        {STATUS_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 -mx-0.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[k] }} />
            <span className="text-slate-700 flex-1">{STATUS_LABEL[k]}</span>
            <span className="w-9 text-right font-semibold text-slate-800 tabular-nums">{uat[k]}</span>
            <span className="w-9 text-right font-semibold text-slate-800 tabular-nums">{uai[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBar({ label, data }: { label: string; data: StatusCount }) {
  const total = data.pending + data.passed + data.failed;
  const [hover, setHover] = useState<keyof StatusCount | null>(null);
  return (
    <div>
      <div className="flex justify-between text-xs font-medium text-slate-500 mb-1.5">
        <span>{label}</span>
        <span className="text-slate-400">{total} เอกสาร</span>
      </div>
      {total === 0 ? (
        <div className="h-3.5 rounded-full bg-slate-100" />
      ) : (
        <div className="flex h-3.5 rounded-full overflow-hidden">
          {STATUS_KEYS.map((k) =>
            data[k] > 0 ? (
              <Tooltip
                key={k}
                label={`${STATUS_LABEL[k]} · ${data[k]} (${Math.round((data[k] / total) * 100)}%)`}
                className="h-full first:[&>div]:rounded-l-full last:[&>div]:rounded-r-full"
                style={{ width: `${(data[k] / total) * 100}%` }}
              >
                <div
                  className="h-full w-full transition-all"
                  style={{
                    background: COLORS[k],
                    opacity: hover && hover !== k ? 0.35 : 1,
                  }}
                  onMouseEnter={() => setHover(k)}
                  onMouseLeave={() => setHover(null)}
                />
              </Tooltip>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

/* -------- Activity Timeline -------- */

function ActivityTimeline({
  items,
  loading,
}: {
  items: DashboardData["activity"];
  loading: boolean;
}) {
  if (loading) {
    return <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>;
  }
  if (items.length === 0) {
    return <div className="py-10 text-center text-slate-400 text-sm">ยังไม่มีกิจกรรมล่าสุด</div>;
  }

  return (
    <div className="max-h-[330px] overflow-y-auto -mr-3 pr-3 activity-scroll">
      <ol className="relative">
        {items.map((a, i) => {
          const last = i === items.length - 1;
          const meta =
            a.kind === "acknowledge"
              ? { ring: "border-emerald-500", bg: "bg-emerald-50", text: "กดรับทราบเอกสาร", title: "กดรับทราบ" }
              : a.kind === "edit"
                ? { ring: "border-amber-500", bg: "bg-amber-50", text: "แก้ไขเอกสาร", title: "แก้ไขเอกสาร" }
                : { ring: "border-brand-500", bg: "bg-brand-50", text: "อัปโหลดเอกสารใหม่", title: "อัปโหลดเอกสาร" };

          return (
            <li
              key={`${a.kind}-${a.document_id}-${i}`}
              className="grid grid-cols-[86px_28px_1fr] gap-3 items-start"
            >
              <div className="text-xs text-slate-500 pt-1 tabular-nums text-right pr-1">
                <div>{formatTime(a.at)}</div>
                <div className="text-[10px] text-slate-400">{formatDay(a.at)}</div>
              </div>

              <div className="relative flex justify-center">
                <Tooltip label={meta.title}>
                  <span
                    className={cn(
                      "relative z-10 w-4 h-4 rounded-full border-2 shadow-sm shrink-0 mt-1.5",
                      meta.ring,
                      meta.bg
                    )}
                  />
                </Tooltip>
                {!last && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 top-6 bottom-[-14px] w-px bg-slate-200"
                  />
                )}
              </div>

              <Link
                href={`/documents/${a.document_id}`}
                className={cn("block pb-6 group", last && "pb-1")}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Avatar path={a.actor_avatar} name={a.actor_name} size="xs" />
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-brand-700 transition-colors">
                    {a.actor_name ?? "ระบบ"}
                  </span>
                  <span className="text-xs text-slate-500">{meta.text}</span>
                </div>
                <div className="text-xs">
                  <span className="text-brand-600 group-hover:text-brand-800 group-hover:underline font-medium">
                    {a.company_name || "-"}
                  </span>
                  {a.work_order && (
                    <>
                      <span className="text-slate-400"> · </span>
                      <span className="text-slate-500">WO {a.work_order}</span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH-u-ca-gregory", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return "วันนี้";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });
}
