import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "Today" for aging/day-count math. Pass the API's meta.server_date
 * ("YYYY-MM-DD", server-local) so a skewed client clock can't change day
 * counts; falls back to the client clock while the query is still loading.
 * Parsed by parts — `new Date("YYYY-MM-DD")` would parse as UTC midnight.
 */
export function serverToday(serverDate?: string): Date {
  if (serverDate) {
    const [y, m, d] = serverDate.split("-").map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
  }
  return new Date();
}

/** Trigger a browser "Save As" for an in-memory Blob (revokes the object URL after). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
