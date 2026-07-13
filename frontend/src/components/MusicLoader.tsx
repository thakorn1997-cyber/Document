import { cn } from "@/lib/utils";

/**
 * Animated equalizer ("music bars") loading indicator. Pure CSS (GPU-friendly scaleY),
 * respects prefers-reduced-motion. Use for page-level loading states.
 */
export function MusicLoader({
  label = "กำลังโหลด...",
  className,
}: {
  label?: string | null;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label ?? "กำลังโหลด"}
      className={cn("flex flex-col items-center justify-center gap-4 py-16", className)}
    >
      <div className="flex items-end gap-1.5 h-10">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="animate-eq w-1.5 rounded-full bg-brand-500"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      {label && <div className="text-sm text-slate-400">{label}</div>}
    </div>
  );
}
