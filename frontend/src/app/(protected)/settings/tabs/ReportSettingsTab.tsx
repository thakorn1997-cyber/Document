"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/endpoints";
import { useToast } from "@/components/Toast";

const DEFAULT_WARN = 8;
const DEFAULT_LATE = 30;

export function ReportSettingsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });

  const [warn, setWarn] = useState(DEFAULT_WARN);
  const [late, setLate] = useState(DEFAULT_LATE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const ra = settingsQ.data?.report_aging;
    setWarn(Number(ra?.warn_days ?? DEFAULT_WARN));
    setLate(Number(ra?.late_days ?? DEFAULT_LATE));
    setDirty(false);
  }, [settingsQ.data]);

  const invalid = !(warn >= 1 && late > warn);

  const mut = useMutation({
    mutationFn: () => settingsApi.patch({ report_aging: { warn_days: warn, late_days: late } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
      toast.success("บันทึกเกณฑ์รายงานเรียบร้อยแล้ว");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "บันทึกไม่สำเร็จ";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        กำหนดเกณฑ์สีคอลัมน์ &quot;จำนวนวัน&quot; ในหน้า Report (นับจากวันติดตั้งจนกว่า UAT = Passed)
      </p>

      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
        <ThresholdRow
          swatch="bg-brand-500"
          title="ปกติ"
          desc="น้อยกว่าเกณฑ์เหลือง — แสดงเป็นสีฟ้า"
          readonly
          hint={`< ${warn} วัน`}
        />
        <ThresholdRow
          swatch="bg-amber-500"
          title="เริ่มนาน (เหลือง)"
          desc="ตั้งแต่กี่วันขึ้นไปให้เป็นสีเหลือง"
          value={warn}
          onChange={(v) => { setWarn(v); setDirty(true); }}
        />
        <ThresholdRow
          swatch="bg-rose-600"
          title="ล่าช้า (แดง)"
          desc="ตั้งแต่กี่วันขึ้นไปให้เป็นสีแดง"
          value={late}
          onChange={(v) => { setLate(v); setDirty(true); }}
        />
      </div>

      {invalid && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
          ค่าต้องเป็น <b>เหลือง ≥ 1</b> และ <b>แดง มากกว่า เหลือง</b>
        </div>
      )}

      <div className="flex justify-end pt-3 border-t border-slate-100">
        <button onClick={() => mut.mutate()} disabled={!dirty || mut.isPending || invalid} className="btn-primary">
          {mut.isPending ? "กำลังบันทึก..." : dirty ? "บันทึก" : "บันทึกแล้ว"}
        </button>
      </div>
    </div>
  );
}

function ThresholdRow({
  swatch, title, desc, value, onChange, readonly, hint,
}: {
  swatch: string; title: string; desc: string;
  value?: number; onChange?: (v: number) => void; readonly?: boolean; hint?: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4">
      <span className={`w-4 h-4 rounded ${swatch} shrink-0`} />
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-800">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      {readonly ? (
        <span className="text-sm text-slate-400">{hint}</span>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={value}
            onChange={(e) => onChange?.(Number(e.target.value))}
            className="input !w-20 text-center h-9"
          />
          <span className="text-sm text-slate-500">วัน</span>
        </div>
      )}
    </div>
  );
}
