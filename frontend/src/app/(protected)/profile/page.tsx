"use client";

import { useQuery } from "@tanstack/react-query";
import { User, Mail, Building2, Briefcase, ShieldCheck } from "lucide-react";
import { authApi } from "@/lib/api/endpoints";
import { AvatarUploader } from "@/components/AvatarUploader";
import { MusicLoader } from "@/components/MusicLoader";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const isAdmin = meQ.data?.roles?.some((r) => r === "SystemAdmin" || r === "admin") ?? false;

  if (!meQ.data) return <MusicLoader />;
  const u = meQ.data;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">โปรไฟล์</h1>
        <p className="text-sm text-slate-500 mt-1">จัดการรูปโปรไฟล์และดูข้อมูลของคุณ</p>
      </div>

      <section className="card p-6">
        <h2 className="section-title mb-4">รูปโปรไฟล์</h2>
        <AvatarUploader userId={u.id} name={u.full_name} avatarPath={u.avatar_path} />
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-4">ข้อมูลส่วนตัว</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoRow icon={User} label="ชื่อ-สกุล" value={u.full_name} />
          <InfoRow icon={Mail} label="Email" value={u.email} mono />
          <InfoRow icon={User} label="Username" value={u.username} mono />
          <InfoRow
            icon={ShieldCheck}
            label="Role"
            value={isAdmin ? "Admin" : "User"}
            badgeCls={isAdmin ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}
          />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-4">แผนก / ระดับ</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <Building2 size={12} /> แผนก
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {u.departments?.length ? (
                u.departments.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 rounded px-2 py-1 text-sm"
                  >
                    <span className="font-mono text-xs text-slate-500">{d.code}</span>
                    <span>{d.name_th}</span>
                  </span>
                ))
              ) : (
                <span className="text-slate-400 text-sm">ยังไม่ได้ระบุ</span>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <Briefcase size={12} /> ระดับ / ตำแหน่ง
            </label>
            <div className="mt-1.5 text-sm">
              {u.position ? (
                <span className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 rounded px-2 py-1">
                  <span className="font-mono text-xs text-slate-500">{u.position.code}</span>
                  <span>{u.position.name}</span>
                </span>
              ) : (
                <span className="text-slate-400">— (ต้องให้ admin ระบุใน Settings)</span>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          หากต้องการเปลี่ยนแผนก, ตำแหน่ง, หรือ Role ต้องติดต่อ Admin
        </p>
      </section>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
  badgeCls,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  badgeCls?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
        <Icon size={12} /> {label}
      </label>
      <div className="mt-1.5">
        {badgeCls ? (
          <span className={cn("inline-block rounded px-2 py-0.5 text-sm", badgeCls)}>{value}</span>
        ) : (
          <div className={cn("text-slate-800", mono && "font-mono text-sm")}>{value}</div>
        )}
      </div>
    </div>
  );
}
