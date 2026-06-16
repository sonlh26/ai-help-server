"use client";

import Gauge from "@/components/Gauge";
import { fmtMb } from "@/components/server/format";
import type { OverviewResp } from "@/components/server/types";
import {
  EmptyCard,
  InfoRow,
  LoadingCard,
  StatCard,
  TabToolbar,
} from "@/components/server/ui";
import { useCallback, useEffect, useState } from "react";

const fmtLoad = (v?: number | null) => (typeof v === "number" ? v.toFixed(2) : "—");

export default function OverviewTab({ serverId }: { serverId: string }) {
  const [data, setData] = useState<OverviewResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setFetchErr("");
    fetch(`/api/be/servers/${serverId}/overview`)
      .then((r) => {
        if (!r.ok) throw new Error("status");
        return r.json() as Promise<OverviewResp>;
      })
      .then((d) => {
        setData(d);
        setCheckedAt(new Date());
      })
      .catch(() => setFetchErr("Không lấy được dữ liệu tổng quan."))
      .finally(() => setLoading(false));
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  const sys = data?.system ?? {};
  const loadAvg = data?.load ?? {};
  const disks = data?.disks ?? [];
  const offline = !loading && data != null && (Boolean(data.error) || data.source === null);

  return (
    <div className="space-y-6 fade-up">
      <TabToolbar
        title={data?.source ? `Nguồn dữ liệu: ${data.source.toUpperCase()}` : "Tổng quan hệ thống"}
        onRefresh={load}
        loading={loading}
      />

      {loading && !data && <LoadingCard />}

      {fetchErr && (
        <div className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-danger)]">
          {fetchErr}
        </div>
      )}

      {offline && (
        <EmptyCard>
          <p className="text-[var(--color-fg)]">Chưa kết nối được tới máy chủ.</p>
          <p className="mt-1">Kiểm tra cấu hình SSH / aaPanel qua menu “…” → Sửa.</p>
          {data?.error && (
            <p className="mt-2 break-words font-[family-name:var(--font-mono)] text-xs text-[var(--color-faint)]">
              {data.error}
            </p>
          )}
        </EmptyCard>
      )}

      {data && !offline && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <StatCard
              label="Uptime"
              value={sys.uptime || "—"}
              sub={sys.cpu_percent != null ? `CPU ${Math.round(sys.cpu_percent)}%` : undefined}
              accent
            />
            <StatCard label="Hệ điều hành" value={sys.os || "—"} sub={sys.kernel || undefined} />
            <StatCard
              label="Load average"
              value={`${fmtLoad(loadAvg.one)}`}
              sub={`5m ${fmtLoad(loadAvg.five)} · 15m ${fmtLoad(loadAvg.fifteen)}`}
            />
            <StatCard
              label="Tổng RAM"
              value={fmtMb(sys.mem_total_mb)}
              sub={
                sys.mem_used_mb != null
                  ? `Dùng ${fmtMb(sys.mem_used_mb)} (${Math.round(sys.mem_percent ?? 0)}%)`
                  : undefined
              }
            />
            <StatCard
              label="CPU Cores"
              value={sys.cpu_cores != null ? `${sys.cpu_cores}` : "—"}
              sub={sys.cpu_model || undefined}
            />
            <StatCard
              label="Websites"
              value={data.sites ? data.sites.total : "—"}
              sub={data.sites ? "Running" : "aaPanel tắt"}
            />
            <StatCard
              label="Databases"
              value={data.databases ? data.databases.total : "—"}
              sub={data.databases ? undefined : "aaPanel tắt"}
            />
          </div>

          {/* Gauges */}
          <div className="card p-5">
            <h3 className="mb-5 text-sm font-semibold">Tài nguyên</h3>
            <div className="flex flex-wrap justify-center gap-8 sm:justify-start">
              <Gauge
                percent={sys.cpu_percent ?? 0}
                label="CPU"
                sublabel={sys.cpu_cores != null ? `${sys.cpu_cores} cores` : undefined}
              />
              <Gauge
                percent={sys.mem_percent ?? 0}
                label="RAM"
                sublabel={
                  sys.mem_used_mb != null ? `${fmtMb(sys.mem_used_mb)} / ${fmtMb(sys.mem_total_mb)}` : undefined
                }
              />
              {disks[0] && (
                <Gauge
                  percent={disks[0].percent ?? 0}
                  label={`Disk ${disks[0].path}`}
                  sublabel={`${disks[0].used} / ${disks[0].total}`}
                />
              )}
            </div>
          </div>

          {/* System total info */}
          <div className="card p-5">
            <h3 className="mb-2 text-sm font-semibold">Thông tin hệ thống</h3>
            <div>
              <InfoRow label="Hostname" value={sys.hostname || "—"} />
              <InfoRow label="Thời gian hoạt động" value={sys.uptime || "—"} />
              <InfoRow label="CPU Model" value={sys.cpu_model || "—"} />
              <InfoRow label="CPU Cores" value={sys.cpu_cores ?? "—"} />
              <InfoRow label="Tổng RAM" value={fmtMb(sys.mem_total_mb)} />
              <InfoRow
                label="Tổng Disk"
                value={disks[0] ? `${disks[0].used} / ${disks[0].total}` : "—"}
              />
              <InfoRow
                label="Swap"
                value={
                  sys.swap_total_mb
                    ? `${fmtMb(sys.swap_used_mb)} / ${fmtMb(sys.swap_total_mb)}`
                    : "—"
                }
              />
              {sys.panel_version && <InfoRow label="Phiên bản Panel" value={sys.panel_version} />}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-[var(--color-faint)]">
        <span>
          Kiểm tra lần cuối: {checkedAt ? checkedAt.toLocaleString("vi-VN") : "—"}
        </span>
        <button className="hover:text-[var(--color-fg)] transition-colors" onClick={load} disabled={loading}>
          Làm mới
        </button>
      </div>
    </div>
  );
}
