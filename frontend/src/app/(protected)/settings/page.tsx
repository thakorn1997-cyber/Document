"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Shield, KeyRound, Users as UsersIcon, Database, FileBarChart } from "lucide-react";
import { authApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { MusicLoader } from "@/components/MusicLoader";

import { MenuPermissionTab } from "./tabs/MenuPermissionTab";
import { LoginMethodsTab } from "./tabs/LoginMethodsTab";
import { UsersTab } from "./tabs/UsersTab";
import { MasterTab } from "./tabs/MasterTab";
import { ReportSettingsTab } from "./tabs/ReportSettingsTab";

type TabKey = "menu" | "login" | "users" | "master" | "report";

const TABS: { key: TabKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "menu", label: "สิทธิ์เมนู", icon: Shield, desc: "เปิด/ปิด เมนูที่ Role User เห็น" },
  { key: "login", label: "การเข้าสู่ระบบ", icon: KeyRound, desc: "ตั้งค่าวิธีการ Login เช่น Azure AD" },
  { key: "users", label: "ผู้ใช้งาน", icon: UsersIcon, desc: "จัดการ User, Role, ระดับ, และแผนก" },
  { key: "master", label: "Master", icon: Database, desc: "จัดการข้อมูลกลาง — แผนก และระดับ" },
  { key: "report", label: "รายงาน", icon: FileBarChart, desc: "ตั้งเกณฑ์สีจำนวนวันในหน้า Report" },
];

function SettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me });

  const admin = meQ.data?.roles?.some((r) => r === "SystemAdmin" || r === "admin") ?? false;

  useEffect(() => {
    if (meQ.data && !admin) router.replace("/dashboard");
  }, [admin, meQ.data, router]);

  const initialTab = (searchParams.get("tab") as TabKey) ?? "menu";
  const [tab, setTab] = useState<TabKey>(initialTab);

  function changeTab(k: TabKey) {
    setTab(k);
    router.replace(`/settings?tab=${k}`, { scroll: false });
  }

  if (!admin) return <div className="text-slate-400">Checking access...</div>;

  const currentMeta = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        {/* <h1 className="text-2xl font-semibold">Settings</h1> */}
        <p className="text-sm text-slate-500 mt-1">{currentMeta.desc}</p>
      </div>

      {/* Tab bar */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-slate-200 bg-brand-50/30">
          {TABS.map((t) => {
            const active = t.key === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => changeTab(t.key)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 text-sm border-b-2 -mb-px transition-colors",
                  active
                    ? "border-brand-600 text-brand-700 font-medium bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50"
                )}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {tab === "menu" && <MenuPermissionTab />}
          {tab === "login" && <LoginMethodsTab />}
          {tab === "users" && <UsersTab />}
          {tab === "master" && <MasterTab />}
          {tab === "report" && <ReportSettingsTab />}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<MusicLoader />}>
      <SettingsInner />
    </Suspense>
  );
}
