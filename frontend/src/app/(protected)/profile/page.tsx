"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ShieldCheck, Building2 } from "lucide-react";
import { authApi, documentApi } from "@/lib/api/endpoints";
import { AvatarUploader } from "@/components/AvatarUploader";
import { MusicLoader } from "@/components/MusicLoader";

export default function ProfilePage() {
  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  // Same key + queryFn shape as dashboard/documents/reports — shares the cache;
  // must keep the full {data, meta} response (see the documents-page cache note).
  const docsQ = useQuery({
    queryKey: ["documents", "all"],
    queryFn: documentApi.listAll,
    staleTime: 30_000,
  });
  const isAdmin = meQ.data?.roles?.some((r) => r === "SystemAdmin" || r === "admin") ?? false;

  const stats = useMemo(() => {
    const docs = docsQ.data?.data ?? [];
    const meId = meQ.data?.id;
    return {
      mine: meId ? docs.filter((d) => d.owner_user_id === meId).length : 0,
      acked: docs.filter((d) => d.acknowledged_by_me).length,
    };
  }, [docsQ.data, meQ.data?.id]);

  if (!meQ.data) return <MusicLoader />;
  const u = meQ.data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">โปรไฟล์</h1>
        <p className="text-sm text-slate-500 mt-1">จัดการรูปโปรไฟล์และดูข้อมูลของคุณ</p>
      </div>

      {/* Hero banner (แบบ 6) — solid brand tile, same visual language as the KPI cards */}
      <section className="card overflow-hidden">
        <div className="relative overflow-hidden bg-brand-700 px-6 py-6">
          <FileText
            size={110}
            aria-hidden
            className="absolute -right-3 -bottom-6 text-white/10 pointer-events-none"
          />
          {/* Balanced 3-part row: avatar (buttons stacked under it) | name block | stats */}
          <div className="relative flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left gap-5 sm:gap-6">
            <AvatarUploader
              userId={u.id}
              name={u.full_name}
              avatarPath={u.avatar_path}
              variant="hero"
            />

            <div className="flex-1 min-w-0">
              <div className="text-xl font-bold text-white tracking-tight">{u.full_name}</div>
              <div className="text-sm text-brand-100 mt-1 truncate">
                {[u.position?.name, u.departments?.[0]?.code, u.email].filter(Boolean).join(" · ")}
              </div>
              <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-medium text-brand-800">
                  <ShieldCheck size={12} />
                  {isAdmin ? "Admin Access" : "User Access"}
                </span>
                {u.departments?.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/25 px-2.5 py-0.5 text-xs font-medium text-white"
                  >
                    <Building2 size={11} />
                    {d.code}
                  </span>
                ))}
              </div>
            </div>

            {/* Personal document stats — computed from the shared documents cache */}
            <div className="flex gap-3 shrink-0">
              <HeroStat value={stats.mine} label="อัปโหลดของฉัน" />
              <HeroStat value={stats.acked} label="รับทราบแล้ว" />
            </div>
          </div>
        </div>

        {/* Detail fields */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="ชื่อ-สกุล" value={u.full_name} />
          <Field label="Username" value={u.username} mono />
          <Field label="Email" value={u.email} mono />
          <Field
            label="ตำแหน่ง / ระดับ"
            value={u.position ? `${u.position.code} · ${u.position.name}` : "— (ต้องให้ admin ระบุใน Settings)"}
          />
          <Field
            label="แผนก"
            value={
              u.departments?.length
                ? u.departments.map((d) => `${d.code} · ${d.name_th}`).join(", ")
                : "ยังไม่ได้ระบุ"
            }
            full
          />
        </div>
        <p className="px-5 pb-4 text-xs text-slate-400">
          หากต้องการเปลี่ยนแผนก, ตำแหน่ง, หรือ Role ต้องติดต่อ Admin
        </p>
      </section>
    </div>
  );
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="relative rounded-xl bg-white/10 border border-white/20 px-5 py-3 text-center min-w-[110px]">
      <div className="text-2xl font-bold text-white tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[11px] text-brand-100 mt-0.5 whitespace-nowrap">{label}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`bg-slate-50 rounded-lg px-3.5 py-2.5 ${full ? "sm:col-span-2" : ""}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-sm text-slate-800 mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
