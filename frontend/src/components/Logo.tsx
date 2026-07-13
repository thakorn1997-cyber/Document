import { cn } from "@/lib/utils";

/**
 * Project Document brand mark — a folded document behind overlapping "P" (deep blue)
 * and "D" (light blue) letters on a soft blue tile. Full-bleed SVG: the caller supplies
 * the rounded/clipped wrapper (rounded-xl + overflow-hidden) so corners stay crisp at any size.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={cn(className)}
      role="img"
      aria-label="Project Document"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="pdTile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5f9ff" />
          <stop offset="1" stopColor="#e6edff" />
        </linearGradient>
        <linearGradient id="pdP" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b7bf0" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="pdD" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fc5fb" />
          <stop offset="1" stopColor="#5db2f6" />
        </linearGradient>
      </defs>

      {/* soft tile background */}
      <rect width="120" height="120" fill="url(#pdTile)" />

      {/* folded document outline sitting behind the letters */}
      <g fill="none" stroke="#c4d3f4" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M45 24 H73 L90 41 V78 a7 7 0 0 1 -7 7 H45 a7 7 0 0 1 -7 -7 V31 a7 7 0 0 1 7 -7 Z" />
        <path d="M72 24 V38 a5 5 0 0 0 5 5 H90" />
      </g>

      {/* overlapping P / D letters */}
      <text
        x="21"
        y="92"
        fontFamily="'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="66"
        fill="url(#pdP)"
      >
        P
      </text>
      <text
        x="52"
        y="92"
        fontFamily="'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="66"
        fill="url(#pdD)"
      >
        D
      </text>
    </svg>
  );
}
