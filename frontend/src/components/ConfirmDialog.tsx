"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, X } from "lucide-react";

export type ConfirmTone = "primary" | "danger" | "success";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type Ctx = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<Ctx | null>(null);

type State = ConfirmOptions & { open: boolean };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ open: false, title: "" });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Ctx>((opts) => {
    setState({ ...opts, open: true });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      setState((s) => ({ ...s, open: false }));
      resolverRef.current?.(result);
      resolverRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!state.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.open, close]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state.open && <Dialog state={state} onClose={close} />}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error("useConfirm must be used inside ConfirmProvider");
  return c;
}

function Dialog({ state, onClose }: { state: State; onClose: (v: boolean) => void }) {
  const tone: ConfirmTone = state.tone ?? "primary";
  const styles = TONE_STYLES[tone];
  const Icon = styles.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={() => onClose(false)}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onClose(false)}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-6 pb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${styles.iconWrap}`}>
            <Icon size={22} className={styles.iconColor} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">{state.title}</h2>
          {state.message && (
            <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-line">{state.message}</p>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50/60 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={() => onClose(false)}
            className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition"
          >
            {state.cancelLabel ?? "ยกเลิก"}
          </button>
          <button
            autoFocus
            onClick={() => onClose(true)}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition ${styles.confirmBtn}`}
          >
            {state.confirmLabel ?? "ยืนยัน"}
          </button>
        </div>
      </div>
    </div>
  );
}

const TONE_STYLES: Record<
  ConfirmTone,
  { icon: React.ElementType; iconWrap: string; iconColor: string; confirmBtn: string }
> = {
  primary: {
    icon: HelpCircle,
    iconWrap: "bg-brand-50",
    iconColor: "text-brand-600",
    confirmBtn: "bg-brand-600 hover:bg-brand-700",
  },
  success: {
    icon: CheckCircle2,
    iconWrap: "bg-emerald-50",
    iconColor: "text-emerald-600",
    confirmBtn: "bg-emerald-600 hover:bg-emerald-700",
  },
  danger: {
    icon: AlertTriangle,
    iconWrap: "bg-rose-50",
    iconColor: "text-rose-600",
    confirmBtn: "bg-rose-600 hover:bg-rose-700",
  },
};
