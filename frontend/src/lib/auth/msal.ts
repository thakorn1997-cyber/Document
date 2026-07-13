import { PublicClientApplication, Configuration } from "@azure/msal-browser";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

let cached: PublicClientApplication | null = null;
let cachedKey: string | null = null;

function computeRedirectUri(): string {
  if (typeof window !== "undefined") return `${window.location.origin}${BASE_PATH}/login`;
  return `http://localhost:3000${BASE_PATH}/login`;
}

export async function getMsalInstance(tenantId: string, clientId: string): Promise<PublicClientApplication> {
  const key = `${tenantId}:${clientId}`;
  if (cached && cachedKey === key) return cached;

  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: computeRedirectUri(),
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    },
  };
  const instance = new PublicClientApplication(config);
  await instance.initialize();
  cached = instance;
  cachedKey = key;
  return instance;
}

export const LOGIN_SCOPES = ["openid", "profile", "email"];
