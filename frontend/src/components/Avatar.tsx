"use client";

import Image from "next/image";
import { avatarUrl } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const SIZE_MAP = {
  xs: { box: "w-6 h-6", text: "text-[10px]" },
  sm: { box: "w-8 h-8", text: "text-xs" },
  md: { box: "w-9 h-9", text: "text-sm" },
  lg: { box: "w-14 h-14", text: "text-lg" },
  xl: { box: "w-24 h-24", text: "text-2xl" },
} as const;

export function Avatar({
  path,
  name,
  size = "md",
  online,
  className,
}: {
  path?: string | null;
  name?: string | null;
  size?: keyof typeof SIZE_MAP;
  online?: boolean;
  className?: string;
}) {
  const s = SIZE_MAP[size];
  const url = avatarUrl(path);
  const initials = initialsOf(name);

  return (
    <div className={cn("relative shrink-0", s.box, className)}>
      {url ? (
        <img
          src={url}
          alt={name ?? "avatar"}
          className={cn(s.box, "rounded-full object-cover border border-white shadow-sm")}
          onError={(e) => {
            // If image fails, replace with initials fallback
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div
          className={cn(
            s.box,
            "rounded-full flex items-center justify-center font-semibold text-white",
            "bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm",
            s.text
          )}
        >
          {initials}
        </div>
      )}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" />
      )}
    </div>
  );
}

// Avoid the unused warning for Image import in future usage
export { Image };
