"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Building2, ClipboardList, User, Calendar, CheckCircle2, XCircle, Clock, StickyNote } from "lucide-react";
import { documentApi } from "@/lib/api/endpoints";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { cn, saveBlob } from "@/lib/utils";
import { MusicLoader } from "@/components/MusicLoader";

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ["document", id], queryFn: () => documentApi.detail(id) });

  const ackMut = useMutation({
    mutationFn: () => documentApi.acknowledge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "รับทราบไม่สำเร็จ";
      toast.error(msg);
      qc.invalidateQueries({ queryKey: ["document", id] });
    },
  });

  async function download(versionId: string, filename: string) {
    try {
      const blob = await documentApi.download(id, versionId);
      saveBlob(blob, filename);
    } catch {
      toast.error("ดาวน์โหลดไฟล์ไม่สำเร็จ");
    }
  }

  async function onAck() {
    if (!q.data) return;
    const ok = await confirm({
      title: "ยืนยันการรับทราบ",
      message: `รับทราบว่าได้อ่านเอกสาร "${q.data.document.title ?? ""}" แล้ว?\n\n⚠ การรับทราบเป็นการล็อกถาวร ไม่สามารถยกเลิกได้\n(ทั้งเอกสารสามารถรับทราบได้ครั้งเดียว)`,
      confirmLabel: "รับทราบ",
      tone: "success",
    });
    if (ok) ackMut.mutate();
  }

  if (q.isLoading) return <MusicLoader />;
  if (!q.data) return <div className="text-slate-400">ไม่พบเอกสาร</div>;

  const { document: d, versions, acknowledgements, acknowledged_by_me } = q.data;
  const locked = acknowledgements.length > 0;
  const acker = acknowledgements[0];
  const ownerName = q.data.owner_project_name ?? null;
  const uatVersions = versions.filter((v) => v.kind === "UAT");
  const uaiVersions = versions.filter((v) => v.kind === "UAI");
  const otherVersions = versions.filter((v) => v.kind !== "UAT" && v.kind !== "UAI");

  return (
    <div className="space-y-6">
      <Tooltip label="กลับไปหน้ารายการเอกสาร">
        <Link
          href={`/documents`}
          aria-label="กลับไปหน้ารายการเอกสาร"
          className="w-10 h-10 rounded-full border border-slate-300 bg-white flex items-center justify-center text-slate-600 shadow-sm hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </Link>
      </Tooltip>

      <div className="card p-6 bg-gradient-to-br from-white to-brand-50/50">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-xs text-brand-700 font-mono">{d.code}</div>
            <h1 className="text-2xl font-semibold mt-1">{d.title}</h1>
            <div className="flex items-center gap-3 mt-3 text-sm text-slate-600 flex-wrap">
              <StatusPill status={d.status} />
              <span className="text-slate-400">·</span>
              <span>{new Date(d.created_at).toLocaleString("th-TH-u-ca-gregory")}</span>
              {locked && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 size={14} />
                    รับทราบแล้วโดย {acker?.full_name}
                  </span>
                </>
              )}
            </div>
            {d.note && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
                <StickyNote size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    หมายเหตุ
                  </div>
                  <p className="mt-0.5 text-sm text-slate-700 break-words whitespace-pre-line">
                    {d.note}
                  </p>
                </div>
              </div>
            )}
          </div>
          {locked ? (
            <Tooltip label={acknowledged_by_me ? "คุณเป็นผู้รับทราบ" : `รับทราบโดย ${acker?.full_name ?? "-"}`}>
              <div className="inline-flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium border shrink-0 bg-emerald-600 text-white border-emerald-600 cursor-default">
                <div className="inline-flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  รับทราบแล้ว
                </div>
                <div className="text-[11px] text-white/85 font-normal">
                  {acknowledged_by_me ? "โดยคุณ" : `โดย ${acker?.full_name ?? "-"}`}
                </div>
              </div>
            </Tooltip>
          ) : (
            <button
              onClick={onAck}
              disabled={ackMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border shrink-0 transition bg-white text-slate-700 border-slate-300 hover:border-brand-500 hover:text-brand-700 disabled:opacity-60"
            >
              <CheckCircle2 size={15} />
              กดรับทราบ
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="card p-5">
          <h2 className="section-title mb-4">ข้อมูล Project</h2>
          <div className="space-y-3 text-sm">
            <InfoRow icon={Building2} label="บริษัท" value={d.company_name} />
            <InfoRow icon={ClipboardList} label="WorkOrder" value={d.work_order} mono />
            <InfoRow icon={User} label="ผู้รับผิดชอบ" value={ownerName ?? "-"} />
            <InfoRow
              icon={Calendar}
              label="วันติดตั้ง"
              value={d.install_date ? new Date(d.install_date).toLocaleDateString("th-TH-u-ca-gregory") : "-"}
            />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="section-title mb-4">UAI / UAT Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatusBlock
              title="UAI"
              subtitle="User Acceptance Install"
              status={d.uai_status}
              date={d.uai_date}
            />
            <StatusBlock
              title="UAT"
              subtitle="User Acceptance Test"
              status={d.uat_status}
              date={d.uat_date}
            />
          </div>
        </section>
      </div>

      {uatVersions.length + uaiVersions.length + otherVersions.length > 0 && (
        <section className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="section-title">Files</h2>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-brand-800 bg-brand-50/60">
              <tr>
                <th className="px-5 py-2 font-medium">Kind</th>
                <th className="px-5 py-2 font-medium">File</th>
                <th className="px-5 py-2 font-medium">Size</th>
                <th className="px-5 py-2 font-medium">Uploaded</th>
                <th className="px-5 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {[...uatVersions, ...uaiVersions, ...otherVersions].map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-5 py-3">
                    <KindBadge kind={v.kind} />
                  </td>
                  <td className="px-5 py-3">{v.original_file_name}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {(v.file_size_bytes / 1024).toFixed(1)} KB
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">
                    {new Date(v.uploaded_at).toLocaleString("th-TH-u-ca-gregory")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => download(v.id, v.original_file_name)}
                      className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="section-title">ผู้รับทราบเอกสาร</h2>
          <span className="text-xs text-slate-500">{acknowledgements.length} คน</span>
        </div>
        {acknowledgements.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            ยังไม่มีผู้กดรับทราบเอกสารนี้
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-brand-800 bg-brand-50/60">
              <tr>
                <th className="px-5 py-2 font-medium w-12 text-center">#</th>
                <th className="px-5 py-2 font-medium">ชื่อผู้รับทราบ</th>
                <th className="px-5 py-2 font-medium">Email</th>
                <th className="px-5 py-2 font-medium">แผนก</th>
                <th className="px-5 py-2 font-medium">Version</th>
                <th className="px-5 py-2 font-medium">รับทราบเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {acknowledgements.map((a, i) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-brand-50/30">
                  <td className="px-5 py-3 text-center text-slate-500 text-xs">{i + 1}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar path={a.avatar_path} name={a.full_name} size="sm" />
                      <span className="font-medium text-slate-800">{a.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600 text-xs">{a.email}</td>
                  <td className="px-5 py-3 text-xs">
                    {a.department_code ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-slate-500">{a.department_code}</span>
                        <span className="text-slate-700">{a.department_name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <KindBadge kind={a.version_kind} /> <span className="text-xs">v{a.version_no}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">
                    {new Date(a.acknowledged_at).toLocaleString("th-TH-u-ca-gregory")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
        <Icon size={15} />
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className={cn("text-slate-800", mono && "font-mono text-xs")}>{value || "-"}</div>
      </div>
    </div>
  );
}

function statusStyle(status?: string) {
  switch (status) {
    case "Passed":
      return {
        Icon: CheckCircle2,
        card: "border-emerald-200 bg-emerald-50/50",
        icon: "bg-emerald-100 text-emerald-600",
        badge: "bg-emerald-100 text-emerald-700",
      };
    case "Failed":
      return {
        Icon: XCircle,
        card: "border-rose-200 bg-rose-50/50",
        icon: "bg-rose-100 text-rose-600",
        badge: "bg-rose-100 text-rose-700",
      };
    case "Pending":
      return {
        Icon: Clock,
        card: "border-amber-200 bg-amber-50/50",
        icon: "bg-amber-100 text-amber-600",
        badge: "bg-amber-100 text-amber-700",
      };
    default:
      return {
        Icon: Clock,
        card: "border-slate-200 bg-slate-50/70",
        icon: "bg-slate-100 text-slate-500",
        badge: "bg-slate-200 text-slate-600",
      };
  }
}

function StatusBlock({
  title,
  subtitle,
  status,
  date,
}: {
  title: string;
  subtitle: string;
  status?: string;
  date?: string | null;
}) {
  const s = statusStyle(status);
  const Icon = s.Icon;
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-3", s.card)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <div className="text-[11px] text-slate-400 truncate">{subtitle}</div>
        </div>
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", s.icon)}>
          <Icon size={18} />
        </div>
      </div>
      <span
        className={cn(
          "inline-flex items-center self-start rounded-md px-2.5 py-1 text-xs font-semibold",
          s.badge
        )}
      >
        {status ?? "Pending"}
      </span>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Calendar size={13} className="text-slate-400 shrink-0" />
        <span>{date ? new Date(date).toLocaleDateString("th-TH-u-ca-gregory") : "ยังไม่ระบุวันที่"}</span>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const color =
    {
      UAT: "bg-brand-100 text-brand-800",
      UAI: "bg-indigo-100 text-indigo-800",
      MAIN: "bg-slate-100 text-slate-600",
    }[kind] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={cn("inline-block rounded px-2 py-0.5 text-xs font-medium", color)}>
      {kind}
    </span>
  );
}

function StatusPill({ status }: { status?: string }) {
  if (!status) return <span className="text-slate-300">-</span>;
  const color =
    {
      // Document workflow statuses
      Draft: "bg-slate-100 text-slate-600",
      Uploaded: "bg-brand-50 text-brand-700",
      Sent: "bg-brand-50 text-brand-700",
      PendingDownload: "bg-slate-100 text-slate-600",
      Downloaded: "bg-amber-50 text-amber-700",
      Acknowledged: "bg-emerald-50 text-emerald-700",
      Replaced: "bg-slate-100 text-slate-500",
      Archived: "bg-slate-100 text-slate-500",
      // UAT/UAI type
      Standard: "bg-[#E7F1FF] text-[#2563EB] border border-[#2563EB]",
      Modify: "bg-[#ECFDF5] text-[#059669] border border-[#059669]",
      "Add-on": "bg-[#F3E8FF] text-[#7C3AED] border border-[#7C3AED]",
    }[status] ?? "bg-slate-100 text-slate-600";
  return <span className={cn("inline-block rounded px-2 py-0.5 text-xs", color)}>{status}</span>;
}
