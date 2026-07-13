"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FileText,
  FileBarChart,
  Settings as SettingsIcon,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from "lucide-react";
import { authApi, settingsApi } from "@/lib/api/endpoints";
import { tokenStore } from "@/lib/auth/token";
import { AvatarMenu } from "@/components/AvatarMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ElementType; key: string; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/documents", label: "Document", icon: FileText, key: "document" },
  { href: "/reports", label: "Report", icon: FileBarChart, key: "report" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, key: "settings", adminOnly: true },
];

function isAdminRole(roles?: string[]) {
  if (!roles) return false;
  return roles.some((r) => r === "SystemAdmin" || r === "admin");
}

// Header title from the current route — longest matching nav prefix (so /documents/[id] → "Document").
function pageTitle(pathname: string): string {
  const match = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  return match?.label ?? "Project Document";
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);

  // Sidebar state: collapsed = desktop icon-rail; mobileOpen = off-canvas drawer.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Rail tooltip: a portal-rendered, fixed-positioned label (so it escapes the
  // sidebar's overflow/transform clipping) shown next to the hovered icon.
  const [mounted, setMounted] = useState(false);
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  useEffect(() => setMounted(true), []);
  function showTip(el: HTMLElement, label: string) {
    if (!collapsed || window.innerWidth < 1024) return; // rail mode on lg+ only
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 12 });
  }
  const hideTip = () => setTip(null);
  // Any layout change invalidates the anchored position → hide.
  useEffect(() => {
    if (!collapsed) setTip(null);
    const onChange = () => setTip(null);
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }, [collapsed]);

  useEffect(() => {
    if (!tokenStore.access) router.replace("/login");
    else setReady(true);
  }, [router]);

  // Restore + persist the collapsed preference.
  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "1") setCollapsed(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const meQ = useQuery({ queryKey: ["me"], queryFn: authApi.me, enabled: ready });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get, enabled: ready });

  const admin = isAdminRole(meQ.data?.roles);
  const visibility = settingsQ.data?.menu_visibility ?? {};

  const visibleNav = useMemo(
    () =>
      NAV.filter((it) => {
        if (it.adminOnly) return admin;
        if (admin) return true;
        return visibility[it.key as keyof typeof visibility] !== false;
      }),
    [admin, visibility]
  );

  async function logout() {
    const rt = tokenStore.refresh;
    if (rt) {
      try {
        await authApi.logout(rt);
      } catch { }
    }
    tokenStore.clear();
    qc.clear(); // ล้าง cache ทั้งหมด (me/settings/documents) กันข้อมูล user เดิมค้างข้ามการ login
    router.replace("/login");
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-glow-radial text-slate-900">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200/70 bg-white/95 backdrop-blur-xl will-change-[width,transform] transition-[width,transform] duration-300 ease-in-out",
          collapsed ? "w-60 lg:w-16" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
      >
        {/* Desktop collapse toggle (floats on the sidebar edge) */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex absolute -right-3 top-20 z-50 w-6 h-6 rounded-full border border-slate-200 bg-white shadow-md items-center justify-center text-slate-500 hover:text-brand-700 hover:border-brand-300 transition-colors"
          title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
          aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
        >
          <ChevronLeft size={14} className={cn("transition-transform duration-300 ease-in-out", collapsed && "rotate-180")} />
        </button>

        {/* Brand / header */}
        <div
          className={cn(
            "h-16 flex items-center border-b border-slate-100/80 px-5",
            collapsed && "lg:px-0 lg:justify-center"
          )}
        >
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-md shadow-slate-300/50 ring-1 ring-slate-200/70 shrink-0">
            <Logo className="w-full h-full" />
          </div>
          <div
            className={cn(
              "ml-3 overflow-hidden transition-all duration-300 ease-in-out",
              collapsed ? "lg:max-w-0 lg:opacity-0 lg:ml-0" : "max-w-[140px] opacity-100"
            )}
          >
            <div className="text-sm font-semibold leading-tight whitespace-nowrap">Project</div>
            <div className="text-xs text-slate-500 leading-tight whitespace-nowrap">Document</div>
          </div>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิดเมนู"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" onScroll={hideTip}>
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  setMobileOpen(false);
                  hideTip();
                }}
                onMouseEnter={(e) => showTip(e.currentTarget, item.label)}
                onMouseLeave={hideTip}
                onFocus={(e) => showTip(e.currentTarget, item.label)}
                onBlur={hideTip}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 ease-in-out group",
                  collapsed && "lg:justify-center lg:gap-0 lg:px-0",
                  active
                    ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/30"
                    : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                )}
              >
                <Icon
                  size={18}
                  className={cn("shrink-0", !active && "group-hover:scale-110 transition-transform")}
                />
                <span
                  className={cn(
                    "overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out",
                    collapsed ? "lg:max-w-0 lg:opacity-0" : "max-w-[160px] opacity-100"
                  )}
                >
                  {item.label}
                </span>
                {item.adminOnly && (
                  <span
                    className={cn(
                      "ml-auto text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded",
                      collapsed && "lg:hidden",
                      active ? "bg-white/25 text-white" : "bg-brand-50 text-brand-600"
                    )}
                  >
                    Admin
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn("p-4 border-t border-slate-100/80", collapsed && "lg:flex lg:justify-center")}>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className={cn("w-2 h-2 rounded-full shrink-0", admin ? "bg-brand-500" : "bg-slate-300")} />
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out",
                collapsed ? "lg:max-w-0 lg:opacity-0" : "max-w-[120px] opacity-100"
              )}
            >
              {admin ? "Admin Access" : "User Access"}
            </span>
          </div>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-300 ease-in-out", collapsed ? "lg:pl-16" : "lg:pl-60")}>
        <header className="h-16 flex items-center gap-3 px-4 sm:px-8 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-20">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 hover:bg-brand-50 hover:text-brand-700"
            aria-label="เปิดเมนู"
          >
            <Menu size={20} />
          </button>

          {/* Page title with a gradient accent bar */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-brand-500 to-brand-700 shrink-0" />
            <span className="text-lg font-semibold text-slate-800 truncate">{pageTitle(pathname)}</span>
          </div>

          {/* Floating glass toolbar: notifications · profile */}
          <div className="ml-auto flex items-center gap-1 backdrop-blur px-1.5 py-1">
            <NotificationBell />
            <div className="w-px h-6 bg-slate-200 mx-0.5 hidden sm:block" />
            <AvatarMenu
              name={meQ.data?.full_name ?? "..."}
              email={meQ.data?.email ?? ""}
              avatarPath={meQ.data?.avatar_path ?? null}
              items={[
                { label: "โปรไฟล์", href: "/profile", icon: UserIcon },
                ...(admin ? [{ label: "Settings", href: "/settings", icon: SettingsIcon }] : []),
                { label: "ออกจากระบบ", onClick: logout, icon: LogOut },
              ]}
            />
          </div>
        </header>
        <main>
          <div className="max-w-8xl mx-auto px-4 sm:px-5 py-6 sm:py-8">{children}</div>
        </main>
      </div>

      {mounted && tip && <SidebarTooltip key={tip.label} label={tip.label} top={tip.top} left={tip.left} />}
    </div>
  );
}

// Rail tooltip — portal to <body> with fixed positioning so it escapes the
// sidebar's overflow/transform clipping; fades + slides in for a smooth feel.
function SidebarTooltip({ label, top, left }: { label: string; top: number; left: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return createPortal(
    <div
      role="tooltip"
      style={{ top, left }}
      className={cn(
        "fixed z-[70] -translate-y-1/2 pointer-events-none transition-[opacity,transform] duration-200 ease-out",
        show ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1.5"
      )}
    >
      <div className="relative rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-slate-900/25 whitespace-nowrap">
        {label}
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
      </div>
    </div>,
    document.body
  );
}
