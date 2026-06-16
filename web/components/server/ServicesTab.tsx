"use client";

import { IconPlay, IconRefresh, IconStop } from "@/components/server/icons";
import type { ServiceAction, ServiceItem, ServicesResp } from "@/components/server/types";
import { EmptyCard, ErrorBanner, LoadingCard, TabToolbar } from "@/components/server/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

type Filter = "all" | "running" | "stopped";
const PAGE_SIZE = 10;

export default function ServicesTab({ serverId }: { serverId: string }) {
  const [data, setData] = useState<ServicesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false); // default: important (web/db) only
  const [page, setPage] = useState(1);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr("");
    fetch(`/api/be/servers/${serverId}/services`)
      .then((r) => {
        if (!r.ok) throw new Error("status");
        return r.json() as Promise<ServicesResp>;
      })
      .then(setData)
      .catch(() => setErr("Không lấy được danh sách dịch vụ."))
      .finally(() => setLoading(false));
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function doAction(svc: ServiceItem, action: ServiceAction) {
    if (
      (action === "stop" || action === "restart") &&
      !confirm(`Bạn chắc chắn muốn ${action === "stop" ? "dừng" : "khởi động lại"} dịch vụ "${svc.name}"?`)
    )
      return;
    setActing(`${svc.name}:${action}`);
    try {
      const res = await fetch(`/api/be/servers/${serverId}/services/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: svc.name, action }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { detail?: string };
        alert(d.detail || "Thao tác thất bại.");
      }
    } catch {
      alert("Lỗi kết nối.");
    } finally {
      setActing(null);
      load();
    }
  }

  const filtered = useMemo(() => {
    const list = data?.services ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((s) => {
      if (!showAll && !s.important) return false; // important-only by default
      if (filter === "running" && !s.running) return false;
      if (filter === "stopped" && s.running) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.unit.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, filter, showAll]);

  const importantTotal = data?.important_total ?? (data?.services ?? []).filter((s) => s.important).length;
  const grandTotal = data?.total ?? (data?.services ?? []).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to first page when filters change.
  useEffect(() => setPage(1), [search, filter, showAll]);

  return (
    <div className="space-y-4 fade-up">
      <TabToolbar title="Dịch vụ hệ thống" onRefresh={load} loading={loading} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Tìm dịch vụ…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[#0a0d0c] p-0.5">
          {(
            [
              ["all", "Tất cả"],
              ["running", "Running"],
              ["stopped", "Stopped"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === key
                  ? "bg-[var(--color-accent)] text-[#07140d]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAll((v) => !v)}
          className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            showAll
              ? "border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          }`}
          title="Mặc định chỉ hiện dịch vụ web/database quan trọng"
        >
          {showAll ? "Đang hiện tất cả" : "Hiển thị tất cả"}
        </button>
      </div>

      {loading && !data && <LoadingCard />}
      {err && <ErrorBanner>{err}</ErrorBanner>}

      {data && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                    <th className="px-4 py-3 font-medium">Dịch vụ</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 font-medium">Mô tả</th>
                    <th className="px-4 py-3 text-right font-medium">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-muted)]">
                        Không có dịch vụ khớp bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((s) => (
                      <tr
                        key={s.unit || s.name}
                        className="border-b border-[var(--color-border-soft)] last:border-0"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--color-fg)]">{s.name}</div>
                          <div className="text-xs text-[var(--color-faint)] font-[family-name:var(--font-mono)]">
                            {s.unit}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`pill ${s.running ? "pill-on" : "pill-down"}`}>
                            <span className="dot" />
                            {s.running ? "Running" : s.sub || "Stopped"}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate text-[var(--color-muted)]" title={s.description}>
                          {s.description || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              className="btn btn-ghost px-2 py-1 text-xs"
                              onClick={() => doAction(s, "start")}
                              disabled={s.running || acting !== null}
                              title="Start"
                            >
                              <IconPlay className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="btn btn-ghost px-2 py-1 text-xs"
                              onClick={() => doAction(s, "restart")}
                              disabled={!s.running || acting !== null}
                              title="Restart"
                            >
                              <IconRefresh className={`h-3.5 w-3.5 ${acting === `${s.name}:restart` ? "animate-spin" : ""}`} />
                            </button>
                            <button
                              className="btn btn-danger px-2 py-1 text-xs"
                              onClick={() => doAction(s, "stop")}
                              disabled={!s.running || acting !== null}
                              title="Stop"
                            >
                              <IconStop className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
            <span>
              {filtered.length} dịch vụ
              {!showAll && grandTotal > importantTotal && (
                <span className="text-[var(--color-faint)]"> · ẩn {grandTotal - importantTotal} dịch vụ khác</span>
              )}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-ghost px-3 py-1 text-xs"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  Trước
                </button>
                <span className="text-xs tabular-nums">
                  {safePage} / {totalPages}
                </span>
                <button
                  className="btn btn-ghost px-3 py-1 text-xs"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Sau
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
