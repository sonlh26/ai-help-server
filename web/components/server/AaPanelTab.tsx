"use client";

import type { AaPanelRow } from "@/components/server/types";
import { EmptyCard, LoadingCard, TabToolbar } from "@/components/server/ui";
import { useCallback, useEffect, useState } from "react";

export interface Column {
  key: string;
  label: string;
  /** Extra keys to try (first non-empty wins). */
  alts?: string[];
  mono?: boolean;
  render?: (row: AaPanelRow) => React.ReactNode;
}

/** Pull the first present, non-empty value from a row across candidate keys. */
function pick(row: AaPanelRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return String(v);
  }
  return "—";
}

/**
 * Generic aaPanel-backed table tab (Sites / Databases / Cron).
 * Handles the raw `{data:[...]}` shape plus `{status:false}` / errors gracefully.
 */
export default function AaPanelTab({
  serverId,
  endpoint,
  title,
  columns,
  emptyText,
}: {
  serverId: string;
  endpoint: "sites" | "databases" | "cron";
  title: string;
  columns: Column[];
  emptyText: string;
}) {
  const [rows, setRows] = useState<AaPanelRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setDisabled(false);
    fetch(`/api/be/servers/${serverId}/${endpoint}`)
      .then((r) => (r.ok ? r.json() : { status: false }))
      .then((d: { data?: AaPanelRow[]; status?: boolean; message?: string }) => {
        // aaPanel returns {status:false,...} when the integration is unavailable.
        if (d == null || d.status === false || !Array.isArray(d.data)) {
          setDisabled(true);
          setRows([]);
          return;
        }
        setRows(d.data);
      })
      .catch(() => {
        setDisabled(true);
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [serverId, endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4 fade-up">
      <TabToolbar title={title} onRefresh={load} loading={loading} />

      {loading && rows === null && <LoadingCard />}

      {!loading && disabled && (
        <EmptyCard>Bật tích hợp aaPanel API (menu “…” → Sửa) để xem {title.toLowerCase()}.</EmptyCard>
      )}

      {!loading && !disabled && rows && rows.length === 0 && <EmptyCard>{emptyText}</EmptyCard>}

      {rows && rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--color-border-soft)] last:border-0"
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-3 text-[var(--color-fg)] ${
                          c.mono ? "font-[family-name:var(--font-mono)] text-xs" : ""
                        }`}
                      >
                        {c.render ? c.render(row) : pick(row, [c.key, ...(c.alts ?? [])])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[var(--color-border-soft)] px-4 py-2.5 text-xs text-[var(--color-muted)]">
            {rows.length} mục
          </div>
        </div>
      )}
    </div>
  );
}
