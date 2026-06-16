"use client";

import { IconDatabase, IconRefresh, IconWarning } from "@/components/server/icons";
import { fmtBytes } from "@/components/server/format";
import type { AaPanelRow } from "@/components/server/types";
import { TabToolbar } from "@/components/server/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZES = [10, 25, 50];

/** Possible DB engine families derived from row metadata. */
type DbKind = "MySQL" | "PostgreSQL" | "MongoDB";

/** Pull the first present, non-empty value from a row across candidate keys. */
function pick(row: AaPanelRow, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return String(v);
  }
  return undefined;
}

/** Map raw db_type/type strings to a normalized engine pill. Default MySQL. */
function deriveKind(row: AaPanelRow): DbKind {
  const raw = (pick(row, ["db_type", "type"]) ?? "").toLowerCase();
  if (raw.includes("mongo")) return "MongoDB";
  if (raw.includes("pg") || raw.includes("postgre")) return "PostgreSQL";
  return "MySQL";
}

/** Render the size cell: number → fmtBytes, non-empty string → as-is, else "—". */
function fmtSize(raw: unknown): string {
  if (raw == null || raw === "") return "—";
  if (typeof raw === "number" && Number.isFinite(raw)) return fmtBytes(raw);
  // Numeric string → treat as bytes.
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return fmtBytes(Number(raw));
  return String(raw);
}

/** Format created date: unix seconds | ms | parseable string → dd/mm/yyyy HH:mm. */
function fmtCreated(raw: unknown): string {
  if (raw == null || raw === "") return "—";
  let d: Date | null = null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    d = new Date(raw < 1e12 ? raw * 1000 : raw); // seconds vs ms
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      d = new Date(n < 1e12 ? n * 1000 : n);
    } else {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) d = parsed;
      else return s; // unparseable string → show raw
    }
  }
  if (!d || isNaN(d.getTime())) return typeof raw === "string" ? raw : "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

const KIND_STYLE: Record<DbKind, { color: string; borderColor: string; background: string }> = {
  MySQL: { color: "#5aa9ff", borderColor: "rgba(90,169,255,0.4)", background: "rgba(90,169,255,0.12)" },
  PostgreSQL: { color: "#7aa2f7", borderColor: "rgba(122,162,247,0.4)", background: "rgba(122,162,247,0.12)" },
  MongoDB: { color: "var(--color-accent)", borderColor: "rgba(33,208,122,0.4)", background: "var(--color-accent-soft)" },
};

function KindPill({ kind }: { kind: DbKind }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={KIND_STYLE[kind]}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      {kind}
    </span>
  );
}

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; msg: string }
  | { phase: "ready"; rows: AaPanelRow[] };

export default function DatabasesTab({ serverId }: { serverId: string }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const load = useCallback(() => {
    setState({ phase: "loading" });
    fetch(`/api/be/servers/${serverId}/databases`)
      .then(async (r) => {
        const d = (await r.json().catch(() => null)) as
          | { data?: AaPanelRow[]; status?: boolean; msg?: string; detail?: string }
          | null;
        if (!r.ok) {
          return {
            err: d?.msg || d?.detail || "Máy chủ trả về lỗi khi tải danh sách databases.",
          };
        }
        // aaPanel returns {status:false, msg} when the integration is blocked/unavailable.
        if (d == null || d.status === false || !Array.isArray(d.data)) {
          return {
            err: d?.msg || d?.detail || "aaPanel tạm thời bị chặn hoặc chưa bật tích hợp API.",
          };
        }
        return { rows: d.data };
      })
      .then((res) => {
        if ("err" in res && res.err) setState({ phase: "error", msg: res.err });
        else setState({ phase: "ready", rows: res.rows ?? [] });
      })
      .catch(() => setState({ phase: "error", msg: "Lỗi kết nối tới máy chủ." }));
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  const loading = state.phase === "loading";
  const allRows = state.phase === "ready" ? state.rows : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((row) => {
      const name = (pick(row, ["name"]) ?? "").toLowerCase();
      const user = (pick(row, ["username", "user"]) ?? "").toLowerCase();
      return name.includes(q) || user.includes(q);
    });
  }, [allRows, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Reset to first page when filter / page size changes.
  useEffect(() => setPage(1), [search, pageSize]);

  return (
    <div className="space-y-4 fade-up">
      {/* Card header */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Databases</h2>
        <p className="mt-0.5 text-sm text-[var(--color-muted)]">
          Danh sách cơ sở dữ liệu trên server (chỉ đọc).
        </p>
      </div>

      <TabToolbar title="" onRefresh={load} loading={loading}>
        <input
          className="input max-w-xs"
          placeholder="Tìm theo tên DB, user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={state.phase !== "ready"}
        />
      </TabToolbar>

      {/* Loading skeleton */}
      {loading && (
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="h-3 w-40 animate-pulse rounded bg-[var(--color-panel-2)]" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-[var(--color-border-soft)] px-4 py-3.5 last:border-0"
            >
              <div className="h-3 flex-1 animate-pulse rounded bg-[var(--color-panel-2)]" />
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--color-panel-2)]" />
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--color-panel-2)]" />
              <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-panel-2)]" />
              <div className="h-3 w-28 animate-pulse rounded bg-[var(--color-panel-2)]" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {state.phase === "error" && (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-[#3a2f10] bg-[var(--color-warn-soft)] text-[var(--color-warn)]">
            <IconWarning className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">Không thể tải danh sách databases</h3>
          {state.msg && (
            <p className="mt-1 max-w-md text-sm text-[var(--color-muted)]">{state.msg}</p>
          )}
          <button className="btn btn-primary mt-5 py-1.5 text-sm" onClick={load}>
            <IconRefresh className="h-4 w-4" />
            Thử lại
          </button>
        </div>
      )}

      {/* Empty state */}
      {state.phase === "ready" && allRows.length === 0 && (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <IconDatabase className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">Chưa có database nào</h3>
          <p className="mt-1 max-w-md text-sm text-[var(--color-muted)]">
            Server này hiện chưa có cơ sở dữ liệu nào.
          </p>
        </div>
      )}

      {/* Table */}
      {state.phase === "ready" && allRows.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                    <th className="px-4 py-3 font-medium">Tên database</th>
                    <th className="px-4 py-3 font-medium">Loại</th>
                    <th className="px-4 py-3 font-medium">Kích thước</th>
                    <th className="px-4 py-3 font-medium">User / Owner</th>
                    <th className="px-4 py-3 font-medium">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                        Không có database khớp tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row, i) => (
                      <tr
                        key={(pick(row, ["name"]) ?? "") + i}
                        className="border-b border-[var(--color-border-soft)] last:border-0"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--color-fg)] font-[family-name:var(--font-mono)] text-xs">
                            {pick(row, ["name"]) ?? "—"}
                          </div>
                          {pick(row, ["ps"]) && (
                            <div className="mt-0.5 text-xs text-[var(--color-faint)]">
                              {pick(row, ["ps"])}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <KindPill kind={deriveKind(row)} />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">
                          {fmtSize(row["size"])}
                        </td>
                        <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg)]">
                          {pick(row, ["username", "user"]) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-muted)]">
                          {fmtCreated(row["addtime"])}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-soft)] px-4 py-3 text-xs text-[var(--color-muted)]">
              <span>
                Hiển thị {from}–{to} của {total} databases
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    aria-label="Trang trước"
                  >
                    ‹
                  </button>
                  <span className="tabular-nums px-1">{safePage}</span>
                  <button
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    aria-label="Trang sau"
                  >
                    ›
                  </button>
                </div>
                <select
                  className="input w-auto py-1 text-xs"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  aria-label="Số dòng mỗi trang"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} / trang
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
