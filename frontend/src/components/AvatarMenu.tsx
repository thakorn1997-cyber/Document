"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings, LogOut, User, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

type Item = { label: string; href?: string; onClick?: () => void; icon: React.ElementType };

export function AvatarMenu({
  name,
  email,
  avatarPath,
  items,
}: {
  name: string;
  email: string;
  avatarPath?: string | null;
  items: Item[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open profile menu"
        className="flex items-center gap-2 pr-1 rounded-full hover:opacity-90 transition"
      >
        <Avatar path={avatarPath} name={name} size="md" online />
        <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[130px] truncate">
          {name}
        </span>
        <ChevronDown
          size={15}
          className={cn("hidden sm:block text-slate-400 transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-64 card shadow-xl shadow-brand-900/10 py-3 z-50 animate-in fade-in slide-in-from-top-1">
          <div className="flex flex-col items-center pb-3 border-b border-slate-100">
            <Avatar path={avatarPath} name={name} size="lg" online />
            <div className="mt-2 text-sm font-semibold text-slate-800">{name}</div>
            <div className="text-xs text-slate-500">{email}</div>
          </div>

          <div className="py-1">
            {items.map((it, i) =>
              it.href ? (
                <Link
                  key={i}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  <it.icon size={15} />
                  {it.label}
                </Link>
              ) : (
                <button
                  key={i}
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                  className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  <it.icon size={15} />
                  {it.label}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const menuIcons = { Settings, LogOut, User };
