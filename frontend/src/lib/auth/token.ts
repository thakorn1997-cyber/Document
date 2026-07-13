const ACCESS_KEY = "pd_access_token";
const REFRESH_KEY = "pd_refresh_token";

// Subscribers notified whenever the access token changes (login / refresh / logout).
// Lets same-tab consumers (e.g. the SSE notification stream) react to token rotation —
// the `storage` event only fires cross-tab, so we need our own in-tab pub/sub.
type TokenListener = (access: string | null) => void;
const listeners = new Set<TokenListener>();

function notify() {
  if (typeof window === "undefined") return;
  const access = localStorage.getItem(ACCESS_KEY);
  listeners.forEach((fn) => fn(access));
}

export const tokenStore = {
  get access() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ access, refresh }: { access: string; refresh?: string }) {
    if (typeof window === "undefined") return;
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    notify();
  },
  setAccess(access: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(ACCESS_KEY, access);
    notify();
  },
  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    notify();
  },
  /** Subscribe to access-token changes. Returns an unsubscribe fn. */
  subscribe(fn: TokenListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
