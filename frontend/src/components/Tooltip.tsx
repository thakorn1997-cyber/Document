"use client";

import { cn } from "@/lib/utils";

/**
 * Hover/focus tooltip styled to match the sidebar rail tooltip
 * (dark slate-900 pill, white text, small arrow). Wrap a single trigger.
 * CSS-only via group-hover — the trigger sits in normal flow (no overflow
 * clipping around the back buttons), so a plain absolute label is enough.
 */
export function Tooltip({
  label,
  placement = "bottom",
  children,
}: {
  label: string;
  placement?: "bottom" | "right";
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[70] opacity-0 transition-[opacity,transform] duration-200 ease-out",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          placement === "right"
            ? "left-full top-1/2 ml-2 -translate-y-1/2 -translate-x-1.5 group-hover/tip:translate-x-0 group-focus-within/tip:translate-x-0"
            : "top-full left-1/2 mt-2 -translate-x-1/2 translate-y-1.5 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0"
        )}
      >
        <span className="relative block rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-slate-900/25 whitespace-nowrap">
          {label}
          {placement === "right" ? (
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
          ) : (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-900" />
          )}
        </span>
      </span>
    </span>
  );
}
