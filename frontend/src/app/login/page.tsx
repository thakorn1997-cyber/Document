"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { authApi, type AuthMethods } from "@/lib/api/endpoints";
import { tokenStore } from "@/lib/auth/token";
import { getMsalInstance, LOGIN_SCOPES } from "@/lib/auth/msal";
import { Logo } from "@/components/Logo";
import { MusicLoader } from "@/components/MusicLoader";

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [azureLoading, setAzureLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [methods, setMethods] = useState<AuthMethods | null>(null);

  useEffect(() => {
    authApi
      .methods()
      .then(setMethods)
      .catch(() =>
        setMethods({
          local_enabled: true,
          azure: { enabled: false, tenant_id: "", client_id: "" },
        })
      );
  }, []);

  const azureCfg = methods?.azure ?? null;
  const localEnabled = methods?.local_enabled !== false;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(username, password);
      tokenStore.set({ access: res.access_token, refresh: res.refresh_token });
      qc.clear(); // กัน cache ของผู้ใช้คนก่อนค้าง (เช่นสลับผู้ใช้โดยไม่ปิดแท็บ)
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "เข้าสู่ระบบไม่สำเร็จ";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onAzure() {
    if (!azureCfg?.enabled) return;
    setAzureLoading(true);
    setError(null);
    try {
      const instance = await getMsalInstance(azureCfg.tenant_id, azureCfg.client_id);
      const result = await instance.loginPopup({ scopes: LOGIN_SCOPES, prompt: "select_account" });
      if (!result.idToken) throw new Error("no id_token returned");
      const res = await authApi.azureExchange(result.idToken);
      tokenStore.set({ access: res.access_token, refresh: res.refresh_token });
      qc.clear(); // กัน cache ของผู้ใช้คนก่อนค้าง (เช่นสลับผู้ใช้โดยไม่ปิดแท็บ)
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error
          ?.message ??
        (err as Error).message ??
        "Azure login failed";
      setError(msg);
    } finally {
      setAzureLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-glow-radial">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-slate-300/50 ring-1 ring-slate-200/70">
            <Logo className="w-full h-full" />
          </div>
          <div className="mt-3 font-semibold text-lg text-slate-900">Project Document</div>
          <div className="text-xs text-slate-500">ระบบจัดการเอกสาร UAT / UAI</div>
        </div>

        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-slate-900">ยินดีต้อนรับกลับ</h2>
          <p className="text-sm text-slate-500 mt-1.5">เข้าสู่ระบบเพื่อจัดการเอกสารของคุณ</p>
        </div>

        <div className="card-glow p-6 sm:p-7 space-y-5">
          {!methods ? (
            <MusicLoader label="กำลังเตรียมการเข้าสู่ระบบ..." className="py-8" />
          ) : (
            <>
              {localEnabled && (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Username</label>
                    <input
                      className="input mt-1.5 h-11"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoFocus
                      placeholder="เช่น admin หรือ email"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-700">Password</label>
                      <span className="text-xs text-slate-400">•••</span>
                    </div>
                    <input
                      type="password"
                      className="input mt-1.5 h-11"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="รหัสผ่านของคุณ"
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">⚠</span>
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full h-11 flex items-center justify-center gap-2 group"
                  >
                    {loading ? (
                      "กำลังเข้าสู่ระบบ..."
                    ) : (
                      <>
                        เข้าสู่ระบบ
                        <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {!localEnabled && !azureCfg?.enabled && (
                <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 space-y-1">
                  <div className="font-semibold">ระบบยังไม่พร้อมใช้งาน</div>
                  <div className="text-xs">
                    Admin ยังไม่ได้เปิดวิธีเข้าสู่ระบบใด ๆ กรุณาติดต่อ admin เพื่อเปิดใช้งาน
                  </div>
                </div>
              )}

              {!localEnabled && azureCfg?.enabled && (
                <div className="text-xs text-slate-500 text-center">
                  กรุณาเข้าสู่ระบบด้วย Microsoft
                </div>
              )}

              {azureCfg?.enabled && (
                <>
                  {localEnabled && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-xs text-slate-400 uppercase tracking-widest">หรือ</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                  )}

                  <button
                    onClick={onAzure}
                    disabled={azureLoading}
                    className="w-full h-11 border border-slate-300 hover:border-brand-500 hover:bg-brand-50/30 disabled:opacity-60 text-slate-800 font-medium rounded-lg text-sm flex items-center justify-center gap-2.5 transition-all"
                  >
                    <MicrosoftLogo />
                    {azureLoading ? "กำลังเชื่อมต่อ Microsoft..." : "เข้าสู่ระบบด้วย Microsoft"}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          มีปัญหาการเข้าใช้งาน? ติดต่อ Admin ของระบบ
        </p>

        <p className="text-[11px] text-slate-400/80 text-center mt-8">
          © 2026 Project Document · Internal use only
        </p>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
