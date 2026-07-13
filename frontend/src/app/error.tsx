"use client";

import { useEffect } from "react";

// Route-segment error boundary — catches render/runtime errors in any page
// under app/ (except the root layout, which global-error.tsx handles) and shows
// a recoverable fallback instead of a blank screen.
export default function Error({
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
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl">
          !
        </div>
        <h1 className="text-lg font-semibold text-slate-800">เกิดข้อผิดพลาด</h1>
        <p className="mt-2 text-sm text-slate-500">
          ระบบทำงานผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาโปรดแจ้งผู้ดูแลระบบ
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
          >
            ลองใหม่
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center h-10 px-5 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            กลับหน้าหลัก
          </a>
        </div>
      </div>
    </div>
  );
}
