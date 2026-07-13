import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { tokenStore } from "@/lib/auth/token";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function resolveBaseUrl(): string {
  // 1. Explicit override wins (e.g. deploy to a separate api domain)
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  // 2. In browser, use SAME-ORIGIN + basePath — next.config rewrites the proxied path.
  if (typeof window !== "undefined") {
    return `${window.location.origin}${BASE_PATH}/api/v1`;
  }
  // 3. SSR fallback
  return "http://localhost:8080/api/v1";
}

const BASE_URL = resolveBaseUrl();

export const api = axios.create({ baseURL: BASE_URL, timeout: 30_000 });

api.interceptors.request.use((cfg) => {
  const t = tokenStore.access;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.refresh;
  if (!refresh) return null;
  try {
    const res = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refresh });
    const access = res.data?.data?.access_token as string | undefined;
    if (!access) return null;
    tokenStore.setAccess(access);
    return access;
  } catch {
    tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshInFlight = refreshInFlight ?? refreshAccessToken();
      const newAccess = await refreshInFlight;
      refreshInFlight = null;
      if (newAccess) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newAccess}` };
        return api.request(original);
      }
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export type ApiError = { code: string; message: string };
