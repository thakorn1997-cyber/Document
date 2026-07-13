"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

// Anchors rendered by <Link> already include the configured basePath in their
// `href` attribute, but router.push() prepends basePath again — so we must strip
// it first, otherwise the path is doubled (e.g. /Document/Document/dashboard → 404).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
function stripBasePath(p: string) {
  if (!BASE_PATH) return p;
  if (p === BASE_PATH) return "/";
  if (p.startsWith(BASE_PATH + "/")) return p.slice(BASE_PATH.length);
  return p;
}

/**
 * Warns before leaving a page that has unsaved edits.
 *
 * Covers two exit paths while `dirty` is true:
 *  1. In-app soft navigation — clicks on any <a>/<Link> (sidebar menu, breadcrumb,
 *     the "ยกเลิก" link). The click is intercepted in the capture phase, the app's
 *     ConfirmDialog is shown, and navigation only proceeds if the user confirms.
 *  2. Hard navigation — browser refresh / tab close / typing a new URL, via the
 *     native `beforeunload` prompt (the browser controls that dialog's wording).
 *
 * Note: the browser Back button on App Router soft-nav is not interceptable
 * reliably on Next 14, so it is intentionally out of scope.
 */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const confirm = useConfirm();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented) return;
      // Let modified clicks (new tab / download) and non-primary buttons through.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (
        !href ||
        (target && target !== "_self") ||
        anchor.hasAttribute("download") ||
        href.startsWith("#") ||
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;

      // Same route → nothing to guard.
      if (href === window.location.pathname + window.location.search) return;

      e.preventDefault();
      e.stopPropagation();

      confirm({
        title: "ออกจากหน้านี้โดยไม่บันทึก?",
        message:
          "คุณได้กรอกข้อมูลไว้แต่ยังไม่ได้บันทึก\nหากออกจากหน้านี้ตอนนี้ ข้อมูลที่กรอกจะหายทั้งหมด",
        confirmLabel: "ออกโดยไม่บันทึก",
        cancelLabel: "อยู่ต่อ",
        tone: "danger",
      }).then((ok) => {
        if (ok) {
          dirtyRef.current = false; // allow the pending navigation through
          router.push(stripBasePath(href));
        }
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [confirm, router]);
}
