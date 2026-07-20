"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  id: string;
  label: string;
  /** Extra text used for matching only (not shown), e.g. an employee code. */
  keywords?: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "-- เลือก --",
  disabled = false,
  allowClear = true,
  searchable = true,
  creatable = false,
  emptyText = "ไม่พบรายชื่อ",
  onCreate,
  createLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  searchable?: boolean;
  /** Allow committing the typed text as a new value not present in options. */
  creatable?: boolean;
  emptyText?: string;
  /**
   * When provided, the "＋" row calls this instead of committing the raw string —
   * e.g. to persist a brand-new record (company) and then select it. The parent
   * is responsible for updating `value` (via its own onChange) after creating.
   */
  onCreate?: (name: string) => void;
  /** Leading verb for the create row (default "ใช้"); pass "เพิ่ม" when onCreate persists. */
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  // In creatable mode the value may be free text not present in options —
  // still show it in the trigger.
  const selectedLabel = selected?.label ?? (creatable && value.trim() ? value : null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.keywords ?? o.label).toLowerCase().includes(q));
  }, [query, options]);

  const trimmedQuery = query.trim();
  const showCreate =
    creatable &&
    trimmedQuery.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Reset + focus (search box, or the popover itself for keyboard nav) — ONLY on the
  // open transition (false→true). The effect also re-runs when `options`/`value` change
  // identity (parents pass a freshly-built array each render); guarding on `justOpened`
  // stops a parent re-render from wiping what the user has typed mid-search.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return; // already open — this run is a parent re-render, keep query
    wasOpen.current = true;
    setQuery("");
    const selIdx = options.findIndex((o) => o.id === value);
    setActive(selIdx >= 0 ? selIdx : 0);
    const id = requestAnimationFrame(() => {
      if (searchable) inputRef.current?.focus();
      else popRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, searchable, options, value]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted item in view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelectorAll("[data-opt]")[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  // "＋" row: delegate to onCreate (persist + parent selects) when provided,
  // otherwise commit the raw typed string (legacy creatable behavior).
  function commitCreate() {
    if (onCreate) {
      onCreate(trimmedQuery);
      setOpen(false);
    } else {
      choose(trimmedQuery);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) choose(opt.id);
      else if (showCreate) commitCreate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "input flex items-center justify-between gap-2 disabled:opacity-60 disabled:cursor-not-allowed",
          open && "ring-2 ring-brand-500/20 border-brand-500"
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-slate-400")}>
          {selectedLabel ?? placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && selectedLabel && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="ล้าง"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown
            size={16}
            className={cn("text-slate-400 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div
          ref={popRef}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="absolute z-30 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 overflow-hidden outline-none animate-in fade-in slide-in-from-top-1 duration-100"
        >
          {searchable && (
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="พิมพ์ค้นหาชื่อ..."
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-2 py-1.5 text-sm bg-slate-50/60 focus:outline-none focus:border-brand-400 focus:bg-white"
                />
              </div>
            </div>
          )}

          <ul ref={listRef} className="max-h-60 overflow-y-auto py-1">
            {showCreate && (
              <li>
                <button
                  type="button"
                  onClick={commitCreate}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-brand-700 hover:bg-brand-50 transition-colors"
                >
                  <Plus size={14} className="shrink-0" />
                  <span className="truncate">
                    {createLabel ?? "เพิ่ม"} &quot;{trimmedQuery}&quot;
                  </span>
                </button>
              </li>
            )}
            {filtered.length === 0 && !showCreate ? (
              <li className="px-3 py-6 text-center text-sm text-slate-400">{emptyText}</li>
            ) : (
              filtered.map((o, i) => {
                const isSel = o.id === value;
                const isActive = i === active;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      data-opt
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors",
                        isActive ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSel && <Check size={15} className="text-brand-600 shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
