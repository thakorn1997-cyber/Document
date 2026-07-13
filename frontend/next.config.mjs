/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  ...(BASE_PATH ? { basePath: BASE_PATH } : {}),
  // Proxy /api/* and /uploads/* to backend. Next.js auto-prepends basePath
  // to the `source`, so writing `/api/v1/:path*` matches `/Document/api/v1/:path*`
  // from the browser's perspective.
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` },
      { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
