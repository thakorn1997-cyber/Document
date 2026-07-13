"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, FileText, FileBarChart } from "lucide-react";
import { settingsApi } from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

type MenuKey = "dashboard" | "document" | "report";
const MENU_LIST: { key: MenuKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "ภาพรวมเอกสารและสรุปตัวเลข" },
  { key: "document", label: "Document", icon: FileText, desc: "รายการเอกสาร UAT/UAI และ Upload" },
  { key: "report", label: "Report", icon: FileBarChart, desc: "รายงานเอกสารและระยะเวลาดำเนินการ" },
];

export function MenuPermissionTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });

  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settingsQ.data?.menu_visibility)
      setVisibility(settingsQ.data.menu_visibility as Record<string, boolean>);
    setDirty(false);
  }, [settingsQ.data]);

  const mut = useMutation({
    mutationFn: () => settingsApi.patch({ menu_visibility: visibility as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
      toast.success("บันทึกสิทธิ์เมนูเรียบร้อยแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "บันทึกไม่สำเร็จ";
      toast.error(msg);
    },
  });

  function toggle(k: MenuKey) {
    setVisibility((v) => ({ ...v, [k]: !(v[k] ?? true) }));
    setDirty(true);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Role admin เห็นทุกเมนูเสมอ — การตั้งค่านี้มีผลกับ Role User เท่านั้น
      </p>

      <div className="space-y-3">
        {MENU_LIST.map((m) => {
          const on = visibility[m.key] ?? true;
          const Icon = m.icon;
          return (
            <div
              key={m.key}
              className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-brand-300 transition"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
                <Icon size={17} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-800">{m.label}</div>
                <div className="text-xs text-slate-500">{m.desc}</div>
              </div>
              <Toggle checked={on} onChange={() => toggle(m.key)} />
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-3 border-t border-slate-100">
        <button
          onClick={async () => {
            const summary = MENU_LIST.map(
              (m) => `• ${m.label}: ${visibility[m.key] === false ? "ปิด" : "เปิด"}`
            ).join("\n");
            const ok = await confirm({
              title: "ยืนยันการบันทึก",
              message: `การเปลี่ยนแปลงจะมีผลกับ Role User ทันที\n\n${summary}`,
              confirmLabel: "บันทึก",
              tone: "primary",
            });
            if (ok) mut.mutate();
          }}
          disabled={!dirty || mut.isPending}
          className="btn-primary"
        >
          {mut.isPending ? "กำลังบันทึก..." : dirty ? "บันทึก" : "บันทึกแล้ว"}
        </button>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        checked ? "bg-brand-600" : "bg-slate-300"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
