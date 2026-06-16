"use client";

import Donut from "@/components/server/Donut";
import Modal from "@/components/server/Modal";
import { clampPct, fmtBytes } from "@/components/server/format";
import type { DiskResp } from "@/components/server/types";
import {
  EmptyCard,
  LoadingCard,
  StatCard,
  TabToolbar,
  UsageBar,
  WarnBanner,
} from "@/components/server/ui";
import { useCallback, useEffect, useState } from "react";

/** A single directory entry returned by the top-dirs scan. */
interface TopDir {
  path: string;
  bytes: number;
  percent_of_top: number;
}

interface TopDirsResp {
  path: string;
  dirs: TopDir[];
}

const QUICK_PATHS = ["/", "/www", "/var", "/home"];

export default function DiskTab({ serverId }: { serverId: string }) {
  const [data, setData] = useState<DiskResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<string | null>(null);

  // Top-directories scan (on-demand: `du` is slow, never auto-loaded).
  const [topPath, setTopPath] = useState("/");
  const [topDirs, setTopDirs] = useState<TopDir[] | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [topErr, setTopErr] = useState("");
  const [scannedPath, setScannedPath] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setErr("");
    fetch(`/api/be/servers/${serverId}/disk`)
      .then((r) => {
        if (!r.ok) throw new Error("status");
        return r.json() as Promise<DiskResp>;
      })
      .then(setData)
      .catch(() => setErr("Không lấy được dữ liệu disk."))
      .finally(() => setLoading(false));
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runOptimize() {
    if (!confirm("Chạy tối ưu disk ở chế độ dry-run? Không có thay đổi nào được áp dụng.")) return;
    setOptimizing(true);
    setOptimizeResult(null);
    try {
      const res = await fetch(`/api/be/servers/${serverId}/disk/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: true }),
      });
      const d = (await res.json().catch(() => ({}))) as { result?: string };
      setOptimizeResult(d.result || "(không có kết quả)");
    } catch {
      setOptimizeResult("Lỗi kết nối khi tối ưu disk.");
    } finally {
      setOptimizing(false);
    }
  }

  const scanTopDirs = useCallback(
    async (rawPath: string) => {
      const path = rawPath.trim() || "/";
      setTopPath(path);
      setTopLoading(true);
      setTopErr("");
      setTopDirs(null);
      try {
        const res = await fetch(
          `/api/be/servers/${serverId}/disk/top-dirs?path=${encodeURIComponent(path)}&limit=15`,
        );
        if (!res.ok) throw new Error("status");
        const d = (await res.json()) as TopDirsResp;
        setTopDirs(Array.isArray(d.dirs) ? d.dirs : []);
        setScannedPath(d.path || path);
      } catch {
        setTopErr("Không quét được thư mục");
      } finally {
        setTopLoading(false);
      }
    },
    [serverId],
  );

  const usedPct = data && data.total_bytes > 0 ? (data.used_bytes / data.total_bytes) * 100 : 0;
  const anyFull = (data?.disks ?? []).some((d) => d.percent >= 90);

  return (
    <div className="space-y-6 fade-up">
      <TabToolbar title="Dung lượng ổ đĩa" onRefresh={load} loading={loading}>
        <button className="btn btn-ghost py-1.5 text-sm" onClick={runOptimize} disabled={optimizing}>
          {optimizing ? "Đang chạy…" : "Tối ưu disk (dry-run)"}
        </button>
      </TabToolbar>

      {loading && !data && <LoadingCard />}
      {err && <EmptyCard>{err}</EmptyCard>}

      {data && (
        <>
          {anyFull && (
            <WarnBanner>
              Có phân vùng đã sử dụng trên 90% dung lượng. Cân nhắc dọn dẹp để tránh đầy ổ đĩa.
            </WarnBanner>
          )}

          {/* Summary */}
          <div className="card p-5">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
              <Donut
                percent={usedPct}
                centerSub={`${fmtBytes(data.used_bytes)} / ${fmtBytes(data.total_bytes)}`}
              />
              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Tổng" value={fmtBytes(data.total_bytes)} />
                <StatCard label="Đã dùng" value={fmtBytes(data.used_bytes)} accent />
                <StatCard label="Còn trống" value={fmtBytes(data.free_bytes)} />
                <StatCard
                  label="Sắp đầy (>90%)"
                  value={fmtBytes(data.near_full_bytes)}
                />
              </div>
            </div>
          </div>

          {/* Partition table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                    <th className="px-4 py-3 font-medium">Mount point</th>
                    <th className="px-4 py-3 font-medium">Loại FS</th>
                    <th className="px-4 py-3 font-medium">Đã dùng / Tổng</th>
                    <th className="min-w-[140px] px-4 py-3 font-medium">Mức sử dụng</th>
                    <th className="px-4 py-3 text-right font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.disks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                        Không có phân vùng nào.
                      </td>
                    </tr>
                  ) : (
                    data.disks.map((d, i) => {
                      const high = d.percent >= 90;
                      return (
                        <tr
                          key={`${d.mount}-${i}`}
                          className="border-b border-[var(--color-border-soft)] last:border-0"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-[var(--color-fg)]">{d.mount}</div>
                            <div className="text-xs text-[var(--color-faint)] font-[family-name:var(--font-mono)]">
                              {d.filesystem}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted)]">{d.type}</td>
                          <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-xs">
                            {fmtBytes(d.used_bytes)} / {fmtBytes(d.total_bytes)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <UsageBar percent={d.percent} />
                              <span className="w-10 text-right text-xs tabular-nums text-[var(--color-muted)]">
                                {Math.round(d.percent)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`pill ${high ? "pill-down" : "pill-on"}`}>
                              <span className="dot" />
                              {high ? "Rất cao" : "Bình thường"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top directories by size (on-demand scan) */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-[var(--color-fg)]">
              Thư mục chiếm nhiều dung lượng
            </h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Gõ đường dẫn rồi bấm Quét để xem thư mục con chiếm nhiều dung lượng nhất (dùng{" "}
              <code className="font-[family-name:var(--font-mono)]">du</code>).
            </p>

            {/* Toolbar */}
            <form
              className="mt-4 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void scanTopDirs(topPath);
              }}
            >
              <input
                className="input min-w-0 flex-1 sm:max-w-xs"
                value={topPath}
                onChange={(e) => setTopPath(e.target.value)}
                placeholder="/"
                aria-label="Đường dẫn thư mục cần quét"
              />
              <button type="submit" className="btn btn-primary py-1.5 text-sm" disabled={topLoading}>
                {topLoading ? "Đang quét…" : "Quét"}
              </button>
            </form>

            {/* Quick picks */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_PATHS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void scanTopDirs(p)}
                  disabled={topLoading}
                  className="rounded-full border border-[var(--color-border)] bg-[#0e1412] px-3 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-fg)] disabled:opacity-55"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* States */}
            {topLoading && (
              <div className="mt-4 text-sm text-[var(--color-muted)]">
                Đang quét… có thể mất vài giây
              </div>
            )}
            {!topLoading && topErr && (
              <div className="mt-4 text-sm text-[var(--color-muted)]">{topErr}</div>
            )}
            {!topLoading && !topErr && topDirs && topDirs.length === 0 && (
              <div className="mt-4 text-sm text-[var(--color-muted)]">Không có dữ liệu</div>
            )}

            {/* Results */}
            {!topLoading && !topErr && topDirs && topDirs.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {scannedPath && (
                  <div className="text-xs text-[var(--color-faint)] font-[family-name:var(--font-mono)]">
                    {scannedPath}
                  </div>
                )}
                {topDirs.map((dir, i) => {
                  const pct = clampPct(dir.percent_of_top);
                  const high = pct >= 50;
                  return (
                    <div
                      key={`${dir.path}-${i}`}
                      className="flex items-center gap-3 border-b border-[var(--color-border-soft)] py-2 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg)]">
                          {dir.path}
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#0e1412]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: high
                                ? "var(--color-warn)"
                                : "var(--color-accent)",
                            }}
                          />
                        </div>
                      </div>
                      <span className="w-20 flex-none text-right font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-muted)]">
                        {fmtBytes(dir.bytes)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {optimizeResult !== null && (
        <Modal title="Kết quả tối ưu disk (dry-run)" onClose={() => setOptimizeResult(null)} size="lg">
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border-soft)] bg-[#0c100f] p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[var(--color-muted)]">
            {optimizeResult}
          </pre>
          <div className="mt-4 flex justify-end">
            <button className="btn btn-ghost" onClick={() => setOptimizeResult(null)}>
              Đóng
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
