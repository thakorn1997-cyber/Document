"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldCheck, User as UserIcon, X, Save, Trash2, Pencil, Briefcase } from "lucide-react";
import {
  userAdminApi,
  masterApi,
  positionApi,
  type AdminUser,
  type Department,
  type Position,
} from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { AvatarUploader } from "@/components/AvatarUploader";
import { Avatar } from "@/components/Avatar";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/lib/utils";

export function UsersTab() {
  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: userAdminApi.list });
  const deptQ = useQuery({ queryKey: ["departments"], queryFn: masterApi.departments });
  const posQ = useQuery({ queryKey: ["positions"], queryFn: positionApi.list });
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const allUsers = usersQ.data ?? [];
  const inactiveCount = allUsers.filter((u) => !u.is_active).length;

  const filtered = allUsers.filter((u) => {
    if (!showInactive && !u.is_active) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.employee_id ?? "").toLowerCase().includes(q)
    );
  });

  const delMut = useMutation({
    mutationFn: (id: string) => userAdminApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("ปิดบัญชีผู้ใช้เรียบร้อยแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "ดำเนินการไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onDelete(u: AdminUser) {
    const ok = await confirm({
      title: "ยืนยันการลบ User",
      message: `ลบ "${u.full_name}" ออกจากระบบ?\n\n• ระบบจะปิดบัญชี (Inactive) เพื่อรักษาประวัติเอกสาร\n• Session ปัจจุบันจะถูกยกเลิก\n• Admin สามารถ activate กลับได้ผ่านหน้า Edit`,
      confirmLabel: "ลบ User",
      tone: "danger",
    });
    if (ok) delMut.mutate(u.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          รายชื่อ User ที่เคยเข้าระบบ (ทั้ง Local และ Azure) — คลิก "แก้ไข" เพื่อจัดการ
        </p>
        <div className="flex items-center gap-3">
          <Tooltip label={inactiveCount === 0 ? "ไม่มี User ที่ Inactive" : ""}>
          <label
            className={cn(
              "inline-flex items-center gap-2 text-xs cursor-pointer select-none px-3 py-2 rounded-lg border transition",
              showInactive
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600 hover:border-slate-300"
            )}
          >
            <input
              type="checkbox"
              className="accent-brand-600"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              disabled={inactiveCount === 0}
            />
            แสดง Inactive
            {inactiveCount > 0 && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-mono",
                  showInactive ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                )}
              >
                {inactiveCount}
              </span>
            )}
          </label>
          </Tooltip>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9 w-64 rounded-full px-5.5 py-5.5"
              placeholder="ค้นหา ชื่อ / email / รหัสพนักงาน"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-brand-50/60 text-brand-800 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 font-medium">รหัสพนักงาน</th>
              <th className="px-3 py-3 font-medium">ชื่อ-สกุล</th>
              <th className="px-3 py-3 font-medium">Email</th>
              <th className="px-3 py-3 font-medium">ระดับ</th>
              <th className="px-3 py-3 font-medium">แผนก</th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="px-3 py-3 font-medium">สถานะ</th>
              <th className="px-3 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {usersQ.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!usersQ.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  ไม่พบ User
                </td>
              </tr>
            )}
            {filtered.map((u) => {
              const isAdmin = u.roles.some((r) => r === "SystemAdmin" || r === "admin");
              return (
                <tr
                  key={u.id}
                  className={cn(
                    "border-t border-slate-100 hover:bg-brand-50/30",
                    !u.is_active && "opacity-60"
                  )}
                >
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">
                    {u.employee_id || "—"}
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-800">{u.full_name}</td>
                  <td className="px-3 py-3 text-slate-600">{u.email}</td>
                  <td className="px-3 py-3 text-slate-600 text-xs">
                    {u.position?.name ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {u.departments.length ? (
                      <div className="flex flex-wrap gap-1">
                        {u.departments.map((d) => (
                          <span
                            key={d.id}
                            className="inline-block bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono"
                          >
                            {d.code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <RoleBadge admin={isAdmin} />
                  </td>
                  <td className="px-3 py-3">
                    {u.is_active ? (
                      <span className="text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs">
                        Active
                      </span>
                    ) : (
                      <span className="text-slate-500 bg-slate-100 rounded px-2 py-0.5 text-xs">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Tooltip label="แก้ไข">
                        <button
                          onClick={() => setEditing(u)}
                          className="text-brand-700 hover:bg-brand-50 rounded p-1.5"
                        >
                          <Pencil size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip label={u.is_active ? "ลบ (soft delete)" : "User inactive อยู่แล้ว"}>
                        <button
                          onClick={() => onDelete(u)}
                          disabled={!u.is_active || delMut.isPending}
                          className="text-rose-600 hover:bg-rose-50 disabled:text-slate-300 disabled:bg-transparent rounded p-1.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          departments={deptQ.data ?? []}
          positions={posQ.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RoleBadge({ admin }: { admin: boolean }) {
  if (admin)
    return (
      <span className="inline-flex items-center gap-1 bg-brand-600 text-white rounded px-2 py-0.5 text-xs">
        <ShieldCheck size={12} /> Admin
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 rounded px-2 py-0.5 text-xs">
      <UserIcon size={12} /> User
    </span>
  );
}

function EditUserModal({
  user,
  departments,
  positions,
  onClose,
}: {
  user: AdminUser;
  departments: Department[];
  positions: Position[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const [fullName, setFullName] = useState(user.full_name);
  const [employeeId, setEmployeeId] = useState(user.employee_id ?? "");
  const [positionId, setPositionId] = useState(user.position_id ?? "");
  const [departmentId, setDepartmentId] = useState(
    user.departments[0]?.id ?? ""
  );
  const [isActive, setIsActive] = useState(user.is_active);
  const [isAdmin, setIsAdmin] = useState(
    user.roles.some((r) => r === "SystemAdmin" || r === "admin")
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mut = useMutation({
    mutationFn: () =>
      userAdminApi.patch(user.id, {
        full_name: fullName,
        employee_id: employeeId,
        position_id: positionId,
        is_active: isActive,
        is_admin: isAdmin,
        department_ids: departmentId ? [departmentId] : [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("บันทึกข้อมูลผู้ใช้เรียบร้อยแล้ว");
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "บันทึกไม่สำเร็จ";
      toast.error(msg);
    },
  });

  async function onSave() {
    const posName = positions.find((p) => p.id === positionId)?.name ?? "—";
    const deptName = departments.find((d) => d.id === departmentId)?.name_th ?? "—";
    const ok = await confirm({
      title: "ยืนยันการแก้ไข",
      message: `บันทึกข้อมูลของ "${user.full_name}"?\n\n• รหัส: ${employeeId || "—"}\n• ระดับ: ${posName}\n• แผนก: ${deptName}\n• Role: ${isAdmin ? "Admin" : "User"}\n• สถานะ: ${isActive ? "Active" : "Inactive"}`,
      confirmLabel: "บันทึก",
      tone: "primary",
    });
    if (ok) mut.mutate();
  }

  if (typeof document === "undefined") return null;
  // Portal ไป <body> + backdrop -inset-8: กัน fixed เพี้ยนจาก ancestor ในเพจ
  // และกัน backdrop-blur เว้นแถบขาวริมจอ (มาตรฐาน modal ทุกตัว)
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-hidden"
      onClick={onClose}
    >
      <div className="absolute -inset-8 bg-slate-900/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold">แก้ไขข้อมูล User</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <Avatar path={user.avatar_path} name={user.full_name} size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{user.email}</div>
              <div className="text-xs text-slate-500">username: {user.username}</div>
            </div>
          </div>

          <div className="pb-3 border-b border-slate-100">
            <label className="text-xs font-medium text-slate-600 mb-2 block">รูปพนักงาน</label>
            <AvatarUploader
              userId={user.id}
              name={user.full_name}
              avatarPath={user.avatar_path}
              size="lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">รหัสพนักงาน</label>
              <input
                className="input mt-1"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="เช่น 20009"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">ชื่อ-สกุล</label>
              <input
                className="input mt-1"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 inline-flex items-center gap-1">
                <Briefcase size={12} /> ระดับ
              </label>
              <select
                className="input mt-1"
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
              >
                <option value="">-- ไม่ระบุ --</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">แผนก</label>
              <select
                className="input mt-1"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">-- ไม่ระบุ --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name_th}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <ToggleRow
              icon={ShieldCheck}
              label="Role: Admin"
              desc="เข้าถึงทุกเมนู + จัดการระบบ"
              checked={isAdmin}
              onChange={() => setIsAdmin((v) => !v)}
            />
            <ToggleRow
              icon={UserIcon}
              label="เปิดใช้งาน (Active)"
              desc="ปิดจะเข้าระบบไม่ได้"
              checked={isActive}
              onChange={() => setIsActive((v) => !v)}
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
          >
            ยกเลิก
          </button>
          <button
            onClick={onSave}
            disabled={mut.isPending}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Save size={14} />
            {mut.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ToggleRow({
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition",
        checked ? "border-brand-300 bg-brand-50/60" : "border-slate-200 hover:border-slate-300"
      )}
      onClick={onChange}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          checked ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
        )}
      >
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-[11px] text-slate-500">{desc}</div>
      </div>
      <input
        type="checkbox"
        className="accent-brand-600 mt-1"
        checked={checked}
        onChange={onChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
