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
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-6 bg-[#eef4fc]">
      {/* Gradient-mesh blobs (แบบ 2 — glassmorphism). aria-hidden: ตกแต่งล้วน */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 -left-24 w-[480px] h-[480px] rounded-full animate-float"
          style={{ background: "radial-gradient(circle, rgba(125,211,252,0.75) 0%, transparent 65%)" }}
        />
        <div
          className="absolute -bottom-52 -right-28 w-[520px] h-[520px] rounded-full animate-float"
          style={{
            background: "radial-gradient(circle, rgba(196,181,253,0.55) 0%, transparent 65%)",
            animationDelay: "-2.5s",
          }}
        />
        <div
          className="absolute -bottom-32 left-1/3 w-[380px] h-[380px] rounded-full animate-float"
          style={{
            background: "radial-gradient(circle, rgba(153,246,228,0.5) 0%, transparent 65%)",
            animationDelay: "-5s",
          }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/60 backdrop-blur-2xl border border-white/80 rounded-3xl shadow-[0_30px_70px_-25px_rgba(2,132,199,0.35)] p-7 sm:p-9 space-y-5">
          {/* Brand header — ย้ายเข้ามาในการ์ดกระจกตามดีไซน์แบบ 2 */}
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg shadow-brand-500/30 ring-1 ring-white/80">
              <Logo className="w-full h-full" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">ยินดีต้อนรับกลับ</h2>
            <p className="text-[13px] text-slate-500 mt-1">
              Project Document · ระบบจัดการเอกสาร UAT / UAI
            </p>
          </div>
          {!methods ? (
            <MusicLoader label="กำลังเตรียมการเข้าสู่ระบบ..." className="py-8" />
          ) : (
            <>
              {localEnabled && (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Username</label>
                    <input
                      className="input mt-1.5 h-11 bg-white/70 border-slate-200/80 focus:bg-white"
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
                      className="input mt-1.5 h-11 bg-white/70 border-slate-200/80 focus:bg-white"
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
                    className="w-full h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-700 disabled:opacity-60 text-white font-semibold text-sm shadow-lg shadow-brand-500/40 hover:shadow-brand-500/50 transition-all flex items-center justify-center gap-2 group"
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
                      <div className="flex-1 h-px bg-slate-300/60" />
                      <span className="text-xs text-slate-400 uppercase tracking-widest">หรือ</span>
                      <div className="flex-1 h-px bg-slate-300/60" />
                    </div>
                  )}

                  <button
                    onClick={onAzure}
                    disabled={azureLoading}
                    className="w-full h-11 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 hover:border-brand-400 disabled:opacity-60 text-slate-800 font-medium text-sm flex items-center justify-center gap-2.5 transition-all shadow-sm"
                  >
                    <MicrosoftLogo />
                    {azureLoading ? "กำลังเชื่อมต่อ Microsoft..." : "เข้าสู่ระบบด้วย Microsoft"}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <p className="text-xs text-slate-500 text-center mt-6">
          มีปัญหาการเข้าใช้งาน? ติดต่อ Admin ของระบบ
        </p>

        <p className="text-[11px] text-slate-400 text-center mt-8">
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
