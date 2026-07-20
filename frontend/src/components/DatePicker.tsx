"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal custom date picker (mockup "แบบ 1") — replaces native <input type="date">
 * everywhere so the calendar looks identical across the app.
 *
 * Value contract mirrors the native input: `value`/`onChange` speak the local
 * calendar day as "YYYY-MM-DD" (timezone-safe — never via toISOString/UTC).
 * `min`/`max` are inclusive "YYYY-MM-DD" bounds; days outside are non-selectable.
 * Display follows the app-wide convention: Thai month names + Gregorian (ค.ศ.)
 * year via `th-TH-u-ca-gregory`.
 */

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const pad = (n: number) => String(n).padStart(2, "0");
const toStr = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

function parse(s?: string | null): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  return { y: +m[1], m0: +m[2] - 1, d: +m[3] };
}

// "YYYY-MM-DD" strings sort lexicographically == chronologically.
const inRange = (s: string, min?: string, max?: string) =>
  (!min || s >= min) && (!max || s <= max);

function todayStr(): string {
  const n = new Date();
  return toStr(n.getFullYear(), n.getMonth(), n.getDate());
}

function fmtDisplay(s: string): string {
  const p = parse(s);
  if (!p) return "";
  return new Date(p.y, p.m0, p.d).toLocaleDateString("th-TH-u-ca-gregory");
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  allowClear = true,
  placeholder = "เลือกวันที่",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  const selected = parse(value);
  // Which month the grid shows; seeded from the selected value (or today).
  const [view, setView] = useState(() => {
    const base = selected ?? parse(todayStr())!;
    return { y: base.y, m0: base.m0 };
  });

  useEffect(() => setMounted(true), []);

  // Re-seed the visible month each time the popup opens so it lands on the
  // current value (or today) rather than wherever the user last browsed.
  useEffect(() => {
    if (!open) return;
    const base = parse(value) ?? parse(todayStr())!;
    setView({ y: base.y, m0: base.m0 });
  }, [open, value]);

  const place = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const POP_H = 340;
    const width = Math.max(r.width, 260);
    // Flip above the trigger when there isn't room below.
    const below = window.innerHeight - r.bottom;
    const top = below < POP_H && r.top > below ? r.top - POP_H - 6 : r.bottom + 6;
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    setPos({ top: Math.max(8, top), left: Math.max(8, left), width });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reposition / close on scroll + resize; close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 6-week grid (42 cells) including muted overflow days from adjacent months.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m0, 1);
    const start = first.getDay(); // 0 = Sunday
    const out: { y: number; m0: number; d: number; muted: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const dt = new Date(view.y, view.m0, 1 - start + i);
      out.push({
        y: dt.getFullYear(),
        m0: dt.getMonth(),
        d: dt.getDate(),
        muted: dt.getMonth() !== view.m0,
      });
    }
    return out;
  }, [view]);

  const monthLabel = new Date(view.y, view.m0, 1).toLocaleDateString("th-TH-u-ca-gregory", {
    month: "long",
    year: "numeric",
  });

  const today = todayStr();

  function pick(c: { y: number; m0: number; d: number }) {
    const s = toStr(c.y, c.m0, c.d);
    if (!inRange(s, min, max)) return;
    onChange(s);
    setOpen(false);
  }

  const shift = (delta: number) =>
    setView((v) => {
      const dt = new Date(v.y, v.m0 + delta, 1);
      return { y: dt.getFullYear(), m0: dt.getMonth() };
    });

  const display = fmtDisplay(value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "input flex items-center justify-between gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50",
          open && "ring-2 ring-brand-500/20 border-brand-500",
          className
        )}
      >
        <span className={cn("truncate", !display && "text-slate-400")}>
          {display || placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && display && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="ล้างวันที่"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={13} />
            </span>
          )}
          <Calendar size={15} className="text-slate-400" />
        </span>
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popRef}
            // The calendar is portaled to <body>, so to any parent popup (table
            // filter, reports date menu, dashboard range) a click inside it looks
            // like an outside-click and closes them. Their close handlers all listen
            // on document `mousedown` (bubble phase), so stopping propagation here
            // keeps the parent popup open while navigating months. Own outside-click
            // still works: clicks truly outside never hit this handler.
            onMouseDown={(e) => e.stopPropagation()}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-50 rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 p-3 animate-in fade-in slide-in-from-top-1 duration-100"
          >
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => shift(-1)}
                aria-label="เดือนก่อนหน้า"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-slate-800">{monthLabel}</span>
              <button
                type="button"
                onClick={() => shift(1)}
                aria-label="เดือนถัดไป"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DOW.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "h-7 flex items-center justify-center text-[11px] font-medium",
                    i === 0 ? "text-rose-400" : i === 6 ? "text-brand-400" : "text-slate-400"
                  )}
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((c, i) => {
                const s = toStr(c.y, c.m0, c.d);
                const isSel =
                  !!selected && selected.y === c.y && selected.m0 === c.m0 && selected.d === c.d;
                const isToday = s === today;
                const ok = inRange(s, min, max);
                const dow = i % 7;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!ok}
                    onClick={() => pick(c)}
                    className={cn(
                      "h-8 w-full rounded-full flex items-center justify-center text-[13px] transition-colors",
                      isSel
                        ? "bg-brand-500 text-white font-medium hover:bg-brand-500"
                        : !ok
                        ? "text-slate-300 cursor-not-allowed"
                        : c.muted
                        ? "text-slate-300 hover:bg-slate-100"
                        : dow === 0
                        ? "text-rose-500 hover:bg-slate-100"
                        : dow === 6
                        ? "text-brand-600 hover:bg-slate-100"
                        : "text-slate-700 hover:bg-slate-100",
                      !isSel && isToday && "ring-1 ring-inset ring-brand-400"
                    )}
                  >
                    {c.d}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const t = today;
                  if (inRange(t, min, max)) pick(parse(t)!);
                }}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                วันนี้
              </button>
              {allowClear && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ล้าง
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
