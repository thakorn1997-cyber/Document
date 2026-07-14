"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, FileUp, CheckCircle2, BadgeCheck } from "lucide-react";
import { notificationApi, type NotificationItem } from "@/lib/api/endpoints";
import { tokenStore } from "@/lib/auth/token";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const router = useRouter();

  const countQ = useQuery({
    queryKey: ["notif-count"],
    queryFn: notificationApi.unreadCount,
    // Initial fetch + fallback poll every 60s in case SSE drops
    refetchInterval: 60_000,
  });

  const listQ = useQuery({
    queryKey: ["notif-list"],
    queryFn: () => notificationApi.list(false, 20),
    enabled: open, // only load list when dropdown is open
  });

  const markAllMut = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  // Click outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // SSE connection — realtime updates.
  // The token is embedded in the stream URL (EventSource can't send headers), so a
  // rotated access token invalidates the open URL: on any drop, EventSource keeps
  // retrying the DEAD token → realtime silently stops. We therefore read the token
  // FRESH on every (re)connect and rebuild the stream whenever the token changes
  // (login/refresh/logout) via tokenStore.subscribe.
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let currentToken: string | null = null;

    function disconnect() {
      es?.close();
      es = null;
    }

    function connect() {
      if (closed) return;
      const token = tokenStore.access; // read fresh — never a stale captured value
      currentToken = token;
      disconnect();
      if (!token) return; // logged out — stay disconnected
      es = new EventSource(notificationApi.streamUrl(token));
      es.onmessage = () => {
        // A new notification arrived — refresh count and list
        qc.invalidateQueries({ queryKey: ["notif-count"] });
        qc.invalidateQueries({ queryKey: ["notif-list"] });
      };
      es.onerror = () => {
        // Transient drop while the token is still valid → browser auto-reconnects
        // with the same (still-good) URL. A token-expiry drop is handled by the
        // 60s count poll triggering an axios 401 → refresh → subscribe callback below.
      };
    }

    connect();

    // Reconnect with the new token whenever it rotates; disconnect on logout.
    const unsubscribe = tokenStore.subscribe((access) => {
      if (access === currentToken) return; // no-op writes (same value)
      connect();
    });

    return () => {
      closed = true;
      unsubscribe();
      disconnect();
    };
  }, [qc]);

  const count = countQ.data ?? 0;
  const items = listQ.data ?? [];

  function onItemClick(n: NotificationItem) {
    if (!n.read_at) markOneMut.mutate(n.id);
    setOpen(false);
    if (n.document_id) router.push(`/documents/${n.document_id}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-brand-50 hover:text-brand-700 transition"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-96 card shadow-2xl shadow-brand-900/10 z-50 animate-in fade-in slide-in-from-top-1 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm text-slate-800">การแจ้งเตือน</div>
              <div className="text-[11px] text-slate-500">
                {count > 0 ? `${count} รายการยังไม่ได้อ่าน` : "อ่านครบทุกรายการแล้ว"}
              </div>
            </div>
            {count > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
                className="text-xs text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
              >
                <CheckCheck size={13} />
                อ่านทั้งหมด
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {listQ.isLoading ? (
              <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={28} className="mx-auto text-slate-300" />
                <div className="mt-2 text-sm text-slate-400">ยังไม่มีการแจ้งเตือน</div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => onItemClick(n)}
                      className={cn(
                        "w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-brand-50/60 transition-colors",
                        !n.read_at && "bg-brand-50/30"
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar path={n.actor_avatar} name={n.actor_name} size="sm" />
                        <KindDot kind={String(n.kind)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <NotifText n={n} />
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {timeAgo(n.created_at)}
                        </div>
                      </div>
                      {!n.read_at && (
                        <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" title="ยังไม่ได้อ่าน" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 text-center">
            <Link
              href="/documents"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-500 hover:text-brand-700"
            >
              ไปที่ Documents →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function KindDot({ kind }: { kind: string }) {
  const cls =
    kind === "document_created"
      ? "bg-brand-500"
      : kind === "document_acknowledged"
      ? "bg-emerald-500"
      : kind === "document_passed"
      ? "bg-teal-500"
      : "bg-slate-400";
  const Icon =
    kind === "document_acknowledged"
      ? CheckCircle2
      : kind === "document_passed"
      ? BadgeCheck
      : FileUp;
  return (
    <span
      className={cn(
        "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white ring-2 ring-white",
        cls
      )}
    >
      <Icon size={9} />
    </span>
  );
}

function NotifText({ n }: { n: NotificationItem }) {
  const actor = n.actor_name || "ระบบ";
  const company = n.payload?.company_name ?? "";
  const wo = n.payload?.work_order ?? "";
  const files = [n.payload?.has_uat ? "UAT" : null, n.payload?.has_uai ? "UAI" : null]
    .filter(Boolean)
    .join(" + ");

  if (n.kind === "document_created") {
    return (
      <div className="text-sm text-slate-800 leading-tight">
        <span className="font-semibold">{actor}</span> เพิ่มเอกสารใหม่
        <div className="text-xs text-slate-600 mt-0.5">
          <span className="font-medium">{company}</span>
          {wo && <span className="text-slate-400"> · WO {wo}</span>}
          {files && (
            <span className="ml-1 inline-flex items-center gap-1">
              {files.split(" + ").map((k) => (
                <span
                  key={k}
                  className="bg-brand-100 text-brand-800 rounded px-1 py-0.5 text-[10px] font-mono"
                >
                  {k}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (n.kind === "document_acknowledged") {
    return (
      <div className="text-sm text-slate-800 leading-tight">
        <span className="font-semibold">{actor}</span> กดรับทราบเอกสารของคุณ
        <div className="text-xs text-slate-600 mt-0.5">
          <span className="font-medium">{company}</span>
          {wo && <span className="text-slate-400"> · WO {wo}</span>}
        </div>
      </div>
    );
  }

  if (n.kind === "document_passed") {
    const passed = [
      n.payload?.uat_status === "Passed" ? "UAT" : null,
      n.payload?.uai_status === "Passed" ? "UAI" : null,
    ].filter(Boolean) as string[];
    return (
      <div className="text-sm text-slate-800 leading-tight">
        <span className="font-semibold">{actor}</span> อัปเดตสถานะเป็น{" "}
        <span className="font-semibold text-teal-700">Passed</span>
        <div className="text-xs text-slate-600 mt-0.5">
          <span className="font-medium">{company}</span>
          {wo && <span className="text-slate-400"> · WO {wo}</span>}
          {passed.length > 0 && (
            <span className="ml-1 inline-flex items-center gap-1">
              {passed.map((k) => (
                <span
                  key={k}
                  className="bg-teal-100 text-teal-800 rounded px-1 py-0.5 text-[10px] font-mono"
                >
                  {k}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    );
  }

  return <div className="text-sm text-slate-800">{n.kind}</div>;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "เมื่อสักครู่";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH-u-ca-gregory");
}
