"use client";

import { useEffect } from "react";

// Root error boundary — the last line of defence. It replaces the root layout
// when an error is thrown there, so it must render its own <html>/<body> and
// cannot rely on providers, fonts, or global CSS being available.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Sarabun','Leelawadee UI',Tahoma,sans-serif",
          background: "#f8fafc",
          color: "#334155",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <div
            style={{
              margin: "0 auto 16px",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#ffe4e6",
              color: "#e11d48",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>ระบบขัดข้อง</h1>
          <p style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>
            เกิดข้อผิดพลาดร้ายแรง กรุณาลองใหม่อีกครั้ง
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 20,
              height: 40,
              padding: "0 20px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  );
}
