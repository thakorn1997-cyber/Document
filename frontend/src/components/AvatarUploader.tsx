"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Trash2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { avatarApi, avatarUrl } from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";

export function AvatarUploader({
  userId,
  name,
  avatarPath,
  size = "xl",
  variant = "default",
  onChanged,
}: {
  userId: string;
  name?: string | null;
  avatarPath?: string | null;
  size?: "lg" | "xl";
  /**
   * "default" = white-card look (Settings › Users — unchanged).
   * "hero" = light-on-dark styling for the profile hero banner (white ring
   * around the avatar, translucent white buttons readable on brand-700).
   */
  variant?: "default" | "hero";
  onChanged?: () => void;
}) {
  const hero = variant === "hero";
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  // Lightbox "view photo" state — the avatar itself is the trigger (no overlay badge).
  const [viewOpen, setViewOpen] = useState(false);
  const imgUrl = avatarUrl(avatarPath);

  useEffect(() => {
    if (!viewOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setViewOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewOpen]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    onChanged?.();
  }

  const uploadMut = useMutation({
    mutationFn: (f: File) => avatarApi.upload(userId, f),
    onSuccess: invalidate,
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "อัปโหลดไม่สำเร็จ";
      setError(msg);
    },
  });

  const removeMut = useMutation({
    mutationFn: () => avatarApi.remove(userId),
    onSuccess: invalidate,
  });

  async function onRemove() {
    const ok = await confirm({
      title: "ลบรูปโปรไฟล์?",
      message: "รูปเดิมจะถูกลบออกจากระบบ",
      confirmLabel: "ลบรูป",
      tone: "danger",
    });
    if (ok) removeMut.mutate();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    if (f.size > 5 * 1024 * 1024) {
      setError("ไฟล์ต้องไม่เกิน 5 MB");
      return;
    }
    uploadMut.mutate(f);
  }

  return (
    <div className={cn("flex gap-4", hero ? "flex-col items-center gap-0" : "items-center")}>
      <div className={cn("relative", hero && "rounded-full ring-[3px] ring-white shadow-lg shadow-brand-900/40")}>
        {imgUrl ? (
          <button
            type="button"
            onClick={() => setViewOpen(true)}
            className="block rounded-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            aria-label="ดูรูปโปรไฟล์"
          >
            <Avatar path={avatarPath} name={name} size={size} />
          </button>
        ) : (
          <Avatar path={avatarPath} name={name} size={size} />
        )}
      </div>

      <div className={cn("space-y-1.5", hero ? "flex-none text-center -mt-3.5 relative z-10" : "flex-1 min-w-0")}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMut.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            hero
              ? "rounded-full bg-white text-brand-700 font-semibold px-3.5 py-1.5 shadow-md shadow-brand-900/25 hover:bg-brand-50 hover:shadow-lg transition-all"
              : "px-3 py-1.5 rounded-lg border border-slate-300 hover:border-brand-500 hover:text-brand-700 text-slate-700"
          )}
        >
          <Camera size={13} />
          {uploadMut.isPending ? "กำลังอัปโหลด..." : avatarPath ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
        </button>
        {error && <div className={cn("text-xs", hero ? "text-amber-200" : "text-red-600")}>{error}</div>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onFile}
      />

      {viewOpen &&
        imgUrl &&
        typeof document !== "undefined" &&
        createPortal(
          // z-[110]: above FormModal (z-[90]); delete closes the lightbox first so
          // the ConfirmDialog (z-[100]) isn't buried underneath.
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setViewOpen(false);
            }}
            role="dialog"
            aria-label="รูปโปรไฟล์"
          >
            <div className="relative">
              <img
                src={imgUrl}
                alt={name ?? "รูปโปรไฟล์"}
                className="rounded-2xl max-w-[min(92vw,520px)] max-h-[70vh] object-contain shadow-2xl bg-white"
              />
              <button
                type="button"
                onClick={() => setViewOpen(false)}
                className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-slate-600 hover:text-slate-900 shadow-lg flex items-center justify-center"
                aria-label="ปิด"
              >
                <X size={17} />
              </button>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-sm text-white/90 truncate">{name}</div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setViewOpen(false);
                      inputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25 border border-white/25"
                  >
                    <Camera size={13} />
                    เปลี่ยนรูป
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewOpen(false);
                      onRemove();
                    }}
                    disabled={removeMut.isPending}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-100 hover:bg-rose-500/35 border border-rose-300/30"
                  >
                    <Trash2 size={13} />
                    ลบรูป
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
