"use client";

import { IconTrash } from "@/components/shell/icons";
import { useCallback, useEffect, useState } from "react";

interface ApprovalRow {
  id: number;
  rule_key: string;
  label: string;
  created_at: string;
}

/** Manage "Always allow" rules for a server: view + revoke. Co-located with chat,
    since this is where the rules get granted (the confirm card "Luôn cho phép"). */
export default function ApprovalsButton({ serverId }: { serverId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!serverId) return;
    setLoading(true);
    fetch(`/api/be/servers/${serverId}/approvals`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setRows(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function revoke(id: number) {
    await fetch(`/api/be/servers/${serverId}/approvals/${id}`, { method: "DELETE" }).catch(() => {});
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!serverId}
        className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-50"
        title="Quản lý quyền tự động đã cấp cho server này"
      >
        Quyền tự động
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-lg p-5 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Quyền tự động (Always)</h3>
              <button onClick={() => setOpen(false)} className="text-[var(--color-faint)] hover:text-[var(--color-fg)]">✕</button>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Các hành động bạn đã chọn “Luôn cho phép” cho server này — agent tự chạy không hỏi lại. Xoá để bắt hỏi xác nhận trở lại.
            </p>

            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {loading && <div className="text-sm text-[var(--color-muted)]">Đang tải…</div>}
              {!loading && rows.length === 0 && (
                <div className="rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412] px-3 py-4 text-center text-sm text-[var(--color-muted)]">
                  Chưa cấp quyền tự động nào.
                </div>
              )}
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[#0e1412] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-[var(--color-fg)]">{r.label || r.rule_key}</div>
                    <div className="truncate text-xs text-[var(--color-faint)] font-[family-name:var(--font-mono)]">{r.rule_key}</div>
                  </div>
                  <button
                    onClick={() => revoke(r.id)}
                    className="grid h-8 w-8 flex-none place-items-center rounded-md text-[var(--color-faint)] transition-colors hover:text-[var(--color-danger)]"
                    aria-label="Thu hồi"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
