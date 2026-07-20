"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Hover/focus tooltip styled EXACTLY like the sidebar rail tooltip
 * (dark slate-900 pill, white text, small arrow, fade+slide in).
 * The bubble is portaled to <body> with fixed positioning — same trick as
 * the sidebar — so it never gets clipped by overflow-x-auto tables, cards,
 * or transformed containers. Wrap a single trigger:
 *
 *   <Tooltip label="ลบ"><button .../></Tooltip>
 *
 * Empty label = no tooltip (children render as-is).
 */
export function Tooltip({
  label,
  placement = "bottom",
  className,
  style,
  children,
}: {
  label: string;
  placement?: "bottom" | "right" | "top";
  /** Extra classes for the inline wrapper (e.g. "w-full" for block triggers). */
  className?: string;
  /** Inline style for the wrapper (e.g. dynamic width segments). */
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !label) return;
    if (placement === "right") setPos({ top: r.top + r.height / 2, left: r.right + 8 });
    else if (placement === "top") setPos({ top: r.top - 8, left: r.left + r.width / 2 });
    else setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
  };
  const close = () => setPos(null);

  // The trigger can move (scroll/resize) while shown — just hide, like the sidebar.
  useEffect(() => {
    if (!pos) return;
    const off = () => setPos(null);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
    };
  }, [pos]);

  return (
    <span
      ref={ref}
      className={cn("relative inline-flex", className)}
      style={style}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {pos && label && (
        <TipBubble key={label} label={label} placement={placement} top={pos.top} left={pos.left} />
      )}
    </span>
  );
}

function TipBubble({
  label,
  placement,
  top,
  left,
}: {
  label: string;
  placement: "bottom" | "right" | "top";
  top: number;
  left: number;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const base = "fixed z-[70] pointer-events-none transition-[opacity,transform] duration-200 ease-out";
  const byPlacement =
    placement === "right"
      ? cn("-translate-y-1/2", show ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1.5")
      : placement === "top"
      ? cn("-translate-x-1/2 -translate-y-full", show ? "opacity-100" : "opacity-0")
      : cn("-translate-x-1/2", show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5");

  return createPortal(
    <div role="tooltip" style={{ top, left }} className={cn(base, byPlacement)}>
      <div className="relative rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-slate-900/25 w-max max-w-[320px]">
        {label}
        {placement === "right" ? (
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
        ) : placement === "top" ? (
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        ) : (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-900" />
        )}
      </div>
    </div>,
    document.body
  );
}
