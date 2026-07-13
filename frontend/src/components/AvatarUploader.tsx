"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { avatarApi } from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";

export function AvatarUploader({
  userId,
  name,
  avatarPath,
  size = "xl",
  onChanged,
}: {
  userId: string;
  name?: string | null;
  avatarPath?: string | null;
  size?: "lg" | "xl";
  onChanged?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar path={avatarPath} name={name} size={size} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center shadow-md border-2 border-white"
          title="เปลี่ยนรูป"
        >
          <Camera size={14} />
        </button>
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploadMut.isPending}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-brand-500 hover:text-brand-700 text-slate-700"
          >
            <Camera size={13} />
            {uploadMut.isPending ? "กำลังอัปโหลด..." : avatarPath ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
          </button>
          {avatarPath && (
            <button
              type="button"
              onClick={onRemove}
              disabled={removeMut.isPending}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={13} />
              ลบรูป
            </button>
          )}
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
