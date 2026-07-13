"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { settingsApi, type LoginMethodsSetting } from "@/lib/api/endpoints";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

export function LoginMethodsTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });

  const [login, setLogin] = useState<LoginMethodsSetting>({
    local_enabled: true,
    azure_enabled: false,
    azure_tenant_id: "",
    azure_client_id: "",
  });
  const [dirty, setDirty] = useState(false);
  const [showClient, setShowClient] = useState(false);

  useEffect(() => {
    if (settingsQ.data?.login_methods)
      setLogin({
        local_enabled: settingsQ.data.login_methods.local_enabled !== false,
        azure_enabled: !!settingsQ.data.login_methods.azure_enabled,
        azure_tenant_id: settingsQ.data.login_methods.azure_tenant_id ?? "",
        azure_client_id: settingsQ.data.login_methods.azure_client_id ?? "",
      });
    setDirty(false);
  }, [settingsQ.data]);

  const azureUsable =
    !!login.azure_enabled &&
    (login.azure_tenant_id ?? "").trim() !== "" &&
    (login.azure_client_id ?? "").trim() !== "";
  const wouldLockOut = !login.local_enabled && !azureUsable;

  const mut = useMutation({
    mutationFn: () => settingsApi.patch({ login_methods: login as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
      toast.success("บันทึกการตั้งค่าการเข้าสู่ระบบเรียบร้อยแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "บันทึกไม่สำเร็จ";
      toast.error(msg);
    },
  });

  function updateLogin<K extends keyof LoginMethodsSetting>(k: K, v: LoginMethodsSetting[K]) {
    setLogin((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Local login (Username/Password) เปิดตลอด — ปิด Azure AD ได้ที่นี่
      </p>

      {/* Local login (toggleable) */}
      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
        <div className="flex items-center gap-4 p-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
            <KeyRound size={16} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-800">Local Login (Username / Password)</div>
            <div className="text-xs text-slate-500">
              เข้าสู่ระบบด้วย username + password ที่ admin สร้างในระบบ
            </div>
          </div>
          <Toggle
            checked={!!login.local_enabled}
            onChange={() => updateLogin("local_enabled", !login.local_enabled)}
          />
        </div>

        {!login.local_enabled && (
          <div className="p-3 bg-amber-50/60 text-xs text-amber-800 flex items-start gap-2">
            <span>⚠</span>
            <div>
              เมื่อปิด Local Login — user ใหม่/เก่าจะเข้าระบบได้เฉพาะผ่าน Microsoft (Azure AD) เท่านั้น
              admin ที่ไม่ผูก Azure จะ login ไม่ได้ ต้องมี Azure enabled + Tenant/Client ครบก่อนปิด
            </div>
          </div>
        )}
      </div>

      {/* Azure */}
      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
        <div className="flex items-center gap-4 p-4">
          <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
            <MicrosoftLogo />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-800">Microsoft (Azure AD)</div>
            <div className="text-xs text-slate-500">
              เข้าสู่ระบบผ่านบัญชี Microsoft — User ใหม่จะได้ Role: User โดยอัตโนมัติ
            </div>
          </div>
          <Toggle
            checked={!!login.azure_enabled}
            onChange={() => updateLogin("azure_enabled", !login.azure_enabled)}
          />
        </div>

        {login.azure_enabled && (
          <div className="p-4 space-y-3 bg-brand-50/30">
            <div>
              <label className="text-xs font-medium text-slate-600">
                Tenant ID (Directory ID) <span className="text-red-500">*</span>
              </label>
              <input
                className="input mt-1 rounded-full px-5.5 py-5.5"
                value={login.azure_tenant_id ?? ""}
                onChange={(e) => updateLogin("azure_tenant_id", e.target.value)}
                placeholder="เช่น 00000000-0000-0000-0000-000000000000"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">
                Client ID (Application ID) <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1">
                <input
                  className="input pr-9 rounded-full px-5.5 py-5.5"
                  type={showClient ? "text" : "password"}
                  value={login.azure_client_id ?? ""}
                  onChange={(e) => updateLogin("azure_client_id", e.target.value)}
                  placeholder="เช่น 00000000-0000-0000-0000-000000000000"
                />
                <button
                  type="button"
                  onClick={() => setShowClient((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Toggle visibility"
                >
                  {showClient ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              ตั้ง Redirect URI แบบ <b>Single-page application</b> เป็น{" "}
              <code className="bg-white px-1 rounded text-brand-700">http://localhost:3000/login</code>
              ใน Azure Portal
            </p>
          </div>
        )}
      </div>

      {wouldLockOut && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
          <span>⛔</span>
          <div>
            <b>ต้องมีอย่างน้อย 1 วิธีเข้าระบบ</b> — ตอนนี้ทั้ง Local + Azure ปิดอยู่ (หรือ Azure ยังไม่ครบ Tenant/Client) —
            ระบบจะไม่ยอมให้บันทึก
          </div>
        </div>
      )}

      <div className="flex justify-end pt-3 border-t border-slate-100">
        <button
          onClick={async () => {
            const summary =
              `Local Login: ${login.local_enabled ? "เปิด" : "ปิด"}\n` +
              `Microsoft Login: ${login.azure_enabled ? "เปิด" : "ปิด"}`;
            const tone = !login.local_enabled ? "danger" : "primary";
            const extra = !login.local_enabled
              ? "\n\n⚠ Local Login จะถูกปิด — user ที่ไม่มี Azure จะเข้าไม่ได้"
              : "";
            const ok = await confirm({
              title: "ยืนยันการบันทึก",
              message: summary + extra,
              confirmLabel: "บันทึก",
              tone,
            });
            if (ok) mut.mutate();
          }}
          disabled={!dirty || mut.isPending || wouldLockOut}
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
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-brand-600" : "bg-slate-300"
        }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"
          }`}
      />
    </button>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
