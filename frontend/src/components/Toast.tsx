"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

type ToastItem = { id: number; type: ToastType; title: string; message: string; duration: number };

type ShowOptions = { type?: ToastType; title?: string; duration?: number };

type ToastApi = {
  show: (message: string, opts?: ShowOptions) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

const DEFAULT_TITLE: Record<ToastType, string> = {
  success: "สำเร็จ",
  error: "เกิดข้อผิดพลาด",
  info: "แจ้งเตือน",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, opts: ShowOptions = {}) => {
    const id = ++idRef.current;
    const type = opts.type ?? "info";
    const title = opts.title ?? DEFAULT_TITLE[type];
    const duration = opts.duration ?? (type === "error" ? 6000 : 4000);
    setItems((list) => [...list, { id, type, title, message, duration }]);
  }, []);

  const api: ToastApi = {
    show,
    success: (message, title) => show(message, { type: "success", title }),
    error: (message, title) => show(message, { type: "error", title }),
    info: (message, title) => show(message, { type: "info", title }),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[120] flex flex-col gap-2.5 w-[min(92vw,360px)] pointer-events-none">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const STYLES: Record<ToastType, { iconColor: string; bar: string }> = {
  success: { iconColor: "text-emerald-600", bar: "bg-emerald-500" },
  error: { iconColor: "text-rose-600", bar: "bg-rose-500" },
  info: { iconColor: "text-brand-600", bar: "bg-brand-500" },
};

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success") {
    // Two-stage line draw: ring then check (see .toast-draw in globals.css).
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle className="toast-draw" style={{ "--dash": 64 } as React.CSSProperties} cx="12" cy="12" r="9.5" />
        <path
          className="toast-draw toast-draw-2"
          style={{ "--dash": 16 } as React.CSSProperties}
          d="M8 12.5l2.6 2.6L16 9.5"
        />
      </svg>
    );
  }
  const Icon = type === "error" ? AlertTriangle : Info;
  return <Icon size={18} strokeWidth={2.2} />;
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const s = STYLES[item.type];
  const [leaving, setLeaving] = useState(false);
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLeaving(true);
    setTimeout(onClose, 340); // matches .toast-out duration
  }, [onClose]);

  // Auto-dismiss after the toast's duration, then play the exit animation.
  useEffect(() => {
    const t = setTimeout(close, item.duration);
    return () => clearTimeout(t);
  }, [item.duration, close]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2.5 shadow-[0_8px_22px_-12px_rgba(15,23,42,0.28)]",
        leaving ? "toast-out" : "toast-in"
      )}
    >
      <span className={cn("toast-pop shrink-0 flex items-center justify-center", s.iconColor)}>
        <ToastIcon type={item.type} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold leading-tight text-slate-800">{item.title}</div>
        <div className="text-[12.5px] leading-snug text-slate-600 break-words whitespace-pre-line">{item.message}</div>
      </div>
      <button
        onClick={close}
        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label="ปิด"
      >
        <X size={14} />
      </button>
      <span className="absolute left-0 bottom-0 h-0.5 w-full">
        <span
          className={cn("toast-progress block h-full w-full", s.bar)}
          style={{ animationDuration: `${item.duration}ms` }}
        />
      </span>
    </div>
  );
}
