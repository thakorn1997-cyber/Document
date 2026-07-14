"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  UserCheck,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Upload as UploadIcon,
  ArrowUpRight,
  Sparkles,
  Calendar,
} from "lucide-react";
import { authApi, dashboardApi, type DashboardData } from "@/lib/api/endpoints";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const dQ = useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardApi.get,
    refetchInterval: 60_000,
  });

  const today = new Date().toLocaleDateString("th-TH-u-ca-gregory", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const d = dQ.data;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="mr-1">👋</span>
            สวัสดี, {meQ.data?.full_name ?? "..."}
          </h1>
          <div className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{today}</span>
            {meQ.data?.position && (
              <>
                <span className="text-slate-300">·</span>
                <span>{meQ.data.position.name}</span>
              </>
            )}
            {meQ.data?.departments && meQ.data.departments.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1">
                  {meQ.data.departments.map((dept) => (
                    <span
                      key={dept.id}
                      className="bg-brand-50 text-brand-700 rounded px-1.5 py-0.5 text-xs font-mono"
                    >
                      {dept.code}
                    </span>
                  ))}
                </span>
              </>
            )}
          </div>
        </div>
        {/* <Link href="/documents/upload" className="btn-primary inline-flex items-center gap-2">
          <UploadIcon size={16} />
          อัปโหลดเอกสาร
        </Link> */}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={FileText}
          iconClass="bg-brand-500/10 text-brand-700"
          label="เอกสารทั้งหมด"
          value={d?.total ?? 0}
          hint={<TrendBadge pct={d?.trend_pct} isNew={d?.trend_is_new} count={d?.this_week} />}
          href="/documents"
        />
        <KpiCard
          icon={UserCheck}
          iconClass="bg-emerald-500/10 text-emerald-700"
          label="ของฉัน (อัปโหลด)"
          value={d?.mine ?? 0}
          hint={<span className="text-xs text-slate-500">{d?.this_week ?? 0} ทั้งระบบสัปดาห์นี้</span>}
        />
        <KpiCard
          icon={Clock}
          iconClass="bg-amber-500/10 text-amber-700"
          label="รอรับทราบ"
          value={d?.pending_ack ?? 0}
          hint={
            (d?.pending_ack ?? 0) > 0 ? (
              <span className="text-xs text-amber-700 inline-flex items-center gap-1">
                <Sparkles size={11} />
                มีเอกสารรอ
              </span>
            ) : (
              <span className="text-xs text-slate-500">อัปเดตแล้ว</span>
            )
          }
          href="/documents"
        />
        <KpiCard
          icon={CheckCircle2}
          iconClass="bg-indigo-500/10 text-indigo-700"
          label="รับทราบวันนี้"
          value={d?.acked_today ?? 0}
          hint={<span className="text-xs text-slate-500">รวมทั้งระบบวันนี้</span>}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Documents per day — with date-range filter */}
        <DocsPerDayCard />

        {/* Dual donut UAT + UAI status */}
        <section className="card p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-700">สถานะ · UAT / UAI</h2>
            <div className="text-xs text-slate-500 mt-0.5">ชี้ที่วงกลมเพื่อดูแต่ละสถานะ</div>
          </div>
          <StatusUATUAI
            uat={d?.statuses.uat ?? { pending: 0, passed: 0, failed: 0 }}
            uai={d?.statuses.uai ?? { pending: 0, passed: 0, failed: 0 }}
          />
        </section>
      </div>

      {/* Activity feed — Timeline */}
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
        <p className="text-xs text-slate-500 mb-5">การเคลื่อนไหวของเอกสารในระบบล่าสุด</p>
        <ActivityTimeline items={d?.activity ?? []} loading={dQ.isLoading} />
      </section>
    </div>
  );
}

/* -------- KPI Card -------- */

function KpiCard({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  href,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  value: number;
  hint?: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", iconClass)}>
          <Icon size={20} />
        </div>
        {href && (
          <ArrowUpRight size={16} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
        )}
      </div>
      <div className="mt-4 text-xs text-slate-500">{label}</div>
      <div className="text-3xl font-bold mt-0.5 tracking-tight">{value.toLocaleString()}</div>
      {hint && <div className="mt-1">{hint}</div>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group card-glow p-5 block hover:-translate-y-0.5 transition-transform"
      >
        {inner}
      </Link>
    );
  }
  return <div className="card-glow p-5">{inner}</div>;
}

function TrendBadge({ pct, isNew, count }: { pct?: number; isNew?: boolean; count?: number }) {
  if (pct === undefined) return null;
  // No baseline last week — show the raw "+N new" count instead of a misleading 100%.
  if (isNew) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 text-emerald-700 bg-emerald-50">
        <TrendingUp size={11} />
        +{count ?? 0} ใหม่สัปดาห์นี้
      </span>
    );
  }
  const up = pct >= 0;
  const rounded = Math.round(Math.abs(pct));
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5",
        up ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
      )}
    >
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {rounded}% สัปดาห์นี้
    </span>
  );
}

/* -------- Documents per day (range filter + smooth area chart) -------- */

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

  // Custom range lives in a popover anchored to the "กำหนดเอง" button (no full-width row).
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

  const q = useQuery({
    queryKey: ["dashboard-daily", from, to],
    queryFn: () => dashboardApi.daily(from, to),
    refetchInterval: 60_000,
  });
  const data = q.data ?? [];
  const total = data.reduce((s, x) => s + x.count, 0);

  return (
    <section className="lg:col-span-2 card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-700">เอกสารต่อวัน</h2>
          <div className="text-xs text-slate-500 mt-0.5">
            รวม {total} เอกสาร · {fmtRange(from, to)}
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
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || undefined}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="input h-9 py-1 w-full mt-0.5"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-slate-500">ถึง</span>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="input h-9 py-1 w-full mt-0.5"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AreaChart data={data} loading={q.isLoading} />
    </section>
  );
}

function AreaChart({
  data,
  loading,
}: {
  data: { date: string; count: number }[];
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
  const max = Math.max(1, ...data.map((d) => d.count));

  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
  const baseY = padT + innerH;

  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.count), v: d.count, date: d.date }));
  const line = smoothPath(pts.map((p) => ({ x: p.x, y: p.y })));
  const area = pts.length ? `${line} L ${pts[n - 1].x},${baseY} L ${pts[0].x},${baseY} Z` : "";
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

/* -------- Dual UAT + UAI Status Donut -------- */

type StatusCount = { pending: number; passed: number; failed: number };

const COLORS = {
  pending: "#f59e0b", // amber-500
  passed: "#059669", // emerald-600
  failed: "#e11d48", // rose-600
};

const STATUS_LABEL: Record<keyof StatusCount, string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
};

const STATUS_KEYS = ["pending", "passed", "failed"] as const;

function StatusUATUAI({ uat, uai }: { uat: StatusCount; uai: StatusCount }) {
  const [hoverKey, setHoverKey] = useState<keyof StatusCount | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MiniDonut label="UAT" data={uat} hoverKey={hoverKey} onHover={setHoverKey} />
        <MiniDonut label="UAI" data={uai} hoverKey={hoverKey} onHover={setHoverKey} />
      </div>

      {/* Combined legend */}
      <div className="pt-3 border-t border-slate-100 space-y-1">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400 pr-1">
          <span className="flex-1" />
          <span className="w-9 text-right">UAT</span>
          <span className="w-9 text-right">UAI</span>
        </div>
        {STATUS_KEYS.map((k) => (
          <div
            key={k}
            onMouseEnter={() => setHoverKey(k)}
            onMouseLeave={() => setHoverKey(null)}
            className={cn(
              "flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 -mx-0.5 cursor-default transition-colors",
              hoverKey === k ? "bg-slate-50" : "hover:bg-slate-50/70"
            )}
          >
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

function MiniDonut({
  label,
  data,
  hoverKey,
  onHover,
}: {
  label: string;
  data: StatusCount;
  hoverKey: keyof StatusCount | null;
  onHover: (k: keyof StatusCount | null) => void;
}) {
  const total = data.pending + data.passed + data.failed;
  const size = 118;
  const stroke = 14;
  const cxy = size / 2;
  const r = (size - stroke - 6) / 2;
  const c = 2 * Math.PI * r;

  const segments = STATUS_KEYS.map((key) => ({ key, value: data[key] }));
  const activeCount = segments.filter((s) => s.value > 0).length;
  const gapPx = activeCount >= 2 ? 12 : 0;

  const hovered = hoverKey ? segments.find((s) => s.key === hoverKey) : null;
  const centerBig = hovered ? hovered.value : total;
  const centerSmall = hovered ? STATUS_LABEL[hovered.key] : "เอกสาร";
  const centerPct = hovered && total > 0 ? Math.round((hovered.value / total) * 100) : null;

  let offset = 0;
  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] font-semibold text-slate-600 mb-1.5">{label}</div>
      <svg
        width={size}
        height={size}
        className="overflow-visible"
        onMouseLeave={() => onHover(null)}
      >
        <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {total > 0 &&
          segments.map((s) => {
            if (s.value === 0) return null;
            const seg = (s.value / total) * c;
            const dash = Math.max(seg - gapPx, 0.001);
            const dimmed = hoverKey !== null && hoverKey !== s.key;
            const el = (
              <circle
                key={s.key}
                cx={cxy}
                cy={cxy}
                r={r}
                fill="none"
                stroke={COLORS[s.key]}
                strokeWidth={hoverKey === s.key ? stroke + 4 : stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-(offset + gapPx / 2)}
                transform={`rotate(-90 ${cxy} ${cxy})`}
                className="transition-all duration-200 cursor-pointer"
                style={{ opacity: dimmed ? 0.28 : 1 }}
                onMouseEnter={() => onHover(s.key)}
              />
            );
            offset += seg;
            return el;
          })}
        <text
          x={cxy}
          y={cxy - 1}
          textAnchor="middle"
          className="fill-slate-900 font-bold transition-colors"
          style={{ fontSize: 21 }}
        >
          {centerBig}
        </text>
        <text x={cxy} y={cxy + 13} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>
          {centerPct !== null ? `${centerSmall} · ${centerPct}%` : centerSmall}
        </text>
      </svg>
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
    return (
      <div className="py-10 text-center text-slate-400 text-sm">ยังไม่มีกิจกรรมล่าสุด</div>
    );
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
              {/* Left — time */}
              <div className="text-xs text-slate-500 pt-1 tabular-nums text-right pr-1">
                <div>{formatTime(a.at)}</div>
                <div className="text-[10px] text-slate-400">{formatDay(a.at)}</div>
              </div>

              {/* Middle — dot + connector line */}
              <div className="relative flex justify-center">
                <span
                  className={cn(
                    "relative z-10 w-4 h-4 rounded-full border-2 shadow-sm shrink-0 mt-1.5",
                    meta.ring,
                    meta.bg
                  )}
                  title={meta.title}
                />
                {!last && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 top-6 bottom-[-14px] w-px bg-slate-200"
                  />
                )}
              </div>

              {/* Right — content */}
              <Link
                href={`/documents/${a.document_id}`}
                className={cn(
                  "block pb-6 group",
                  last && "pb-1"
                )}
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "เมื่อสักครู่";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH-u-ca-gregory");
}
