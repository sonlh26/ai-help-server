"use client";

import ServiceGauge from "@/components/ServiceGauge";
import Tabs from "@/components/Tabs";
import { IconChevron } from "@/components/shell/icons";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

/* ===========================================================================
   Service detail screen (recreated from the design mockups).

   NOTE: this is a faithful UI rebuild. The figures below are the sample values
   shown in the mockups, kept in one place so they can later be swapped for a
   real API response (e.g. GET /api/be/servers/{id}/services/{name}).
=========================================================================== */

const SERVICE = {
  name: "nginx",
  unit: "nginx.service",
  description: "High performance web server",
  status: "running" as "running" | "stopped",
  uptime: "15 ngày 4 giờ",
  autostart: true,
  user: "www-data",
  group: "www-data",
  pid: 23145,
  version: "1.24.0-1ubuntu1",
};

const RESOURCES = {
  cpu: { percent: 2.4, value: "2.4%", caption: "0.05 / 2 vCPU" },
  ram: { percent: 8, value: "128 MB", caption: "128 / 1.56 GB" },
  disk: { percent: 12, value: "1.2 MB/s", caption: "1.2 / 10 MB/s" },
};

interface PortRow {
  port: number;
  protocol: string;
  address: string;
}
const PORTS: PortRow[] = [
  { port: 80, protocol: "TCP", address: "0.0.0.0" },
  { port: 80, protocol: "TCP", address: "[::]" },
  { port: 443, protocol: "TCP", address: "0.0.0.0" },
  { port: 443, protocol: "TCP", address: "[::]" },
];

const QUICK_ACTIONS = [
  { key: "logs", label: "Xem logs" },
  { key: "config", label: "Cấu hình" },
  { key: "check", label: "Kiểm tra cấu hình" },
  { key: "processes", label: "Danh sách process" },
  { key: "test", label: "Test kết nối" },
];

/* 7-day In/Out traffic series (MB/s), matching the mockup chart shape. */
const TRAFFIC = {
  labels: ["12/05", "13/05", "14/05", "15/05", "16/05", "17/05", "18/05"],
  in: [3.4, 2.8, 4.1, 3.6, 5.2, 4.0, 6.8, 5.4, 7.1, 6.2, 8.0, 9.4, 11.6, 8.2, 9.1],
  out: [1.1, 0.9, 1.4, 1.2, 1.8, 1.5, 2.2, 1.9, 2.6, 2.1, 2.8, 3.2, 6.1, 3.4, 4.0],
  totalIn: "256.45 GB",
  totalOut: "98.32 GB",
};

/* Access-log sample rows (the visible page of the mockup). */
interface LogRow {
  time: string;
  ip: string;
  method: string;
  url: string;
  status: number;
  size: string;
  referrer: string;
  agent: string;
}
const LOGS: LogRow[] = [
  { time: "18/05/2024 14:35:22", ip: "203.0.113.24", method: "GET", url: "/", status: 200, size: "2.13 KB", referrer: "-", agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  { time: "18/05/2024 14:35:24", ip: "203.0.113.25", method: "GET", url: "/assets/app.css", status: 200, size: "24.5 KB", referrer: "https://example.com/", agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  { time: "18/05/2024 14:35:24", ip: "203.0.113.25", method: "GET", url: "/assets/app.js", status: 200, size: "89.7 KB", referrer: "https://example.com/", agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  { time: "18/05/2024 14:35:25", ip: "203.0.113.26", method: "POST", url: "/api/auth/login", status: 200, size: "512 B", referrer: "https://example.com/login", agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  { time: "18/05/2024 14:35:25", ip: "203.0.113.26", method: "GET", url: "/api/user/profile", status: 200, size: "1.02 KB", referrer: "https://example.com/dashboard", agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  { time: "18/05/2024 14:35:26", ip: "198.51.100.11", method: "GET", url: "/images/logo.png", status: 304, size: "0 B", referrer: "https://example.com/", agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  { time: "18/05/2024 14:35:27", ip: "198.51.100.12", method: "GET", url: "/favicon.ico", status: 404, size: "153 B", referrer: "https://example.com/", agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  { time: "18/05/2024 14:35:28", ip: "203.0.113.27", method: "GET", url: "/api/data/list", status: 200, size: "3.45 KB", referrer: "https://example.com/dashboard", agent: "Mozilla/5.0 (Linux; Android 11; Pixel 5)" },
  { time: "18/05/2024 14:35:28", ip: "203.0.113.27", method: "GET", url: "/api/data/detail/123", status: 200, size: "1.12 KB", referrer: "https://example.com/dashboard", agent: "Mozilla/5.0 (Linux; Android 11; Pixel 5)" },
  { time: "18/05/2024 14:35:29", ip: "198.51.100.13", method: "GET", url: "/", status: 301, size: "178 B", referrer: "-", agent: "curl/7.68.0" },
];

/* Shared helpers ----------------------------------------------------------- */
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className="text-right text-sm font-medium text-[var(--color-fg)] font-[family-name:var(--font-mono)]">
        {value}
      </span>
    </div>
  );
}

/** Status color for an HTTP code (2xx green, 3xx blue, 4xx red, 5xx red). */
function statusColor(code: number): string {
  if (code >= 200 && code < 300) return "var(--color-accent)";
  if (code >= 300 && code < 400) return "#5aa9f7";
  return "var(--color-danger)";
}

/* Traffic chart (inline SVG, no chart lib) --------------------------------- */
function TrafficChart() {
  const W = 640;
  const H = 220;
  const pad = { t: 12, r: 12, b: 24, l: 36 };
  const all = [...TRAFFIC.in, ...TRAFFIC.out];
  const max = Math.ceil(Math.max(...all) / 3) * 3; // round up to 3-step grid

  const n = TRAFFIC.in.length;
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);

  const linePath = (s: number[]) =>
    s.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = (s: number[]) =>
    `${linePath(s)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const gridLines = [0, 3, 6, 9, 12].filter((v) => v <= max);

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Biểu đồ lưu lượng 7 ngày">
        <defs>
          <linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(33,208,122,0.28)" />
            <stop offset="100%" stopColor="rgba(33,208,122,0)" />
          </linearGradient>
          <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(90,169,247,0.26)" />
            <stop offset="100%" stopColor="rgba(90,169,247,0)" />
          </linearGradient>
        </defs>

        {/* Grid + y labels */}
        {gridLines.map((v) => (
          <g key={v}>
            <line x1={pad.l} y1={y(v)} x2={W - pad.r} y2={y(v)} stroke="var(--color-border-soft)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(v) + 3} textAnchor="end" className="fill-[var(--color-faint)]" fontSize={10}>
              {v} MB/s
            </text>
          </g>
        ))}

        {/* Areas + lines */}
        <path d={areaPath(TRAFFIC.in)} fill="url(#inFill)" />
        <path d={areaPath(TRAFFIC.out)} fill="url(#outFill)" />
        <path d={linePath(TRAFFIC.in)} fill="none" stroke="var(--color-accent)" strokeWidth={1.8} />
        <path d={linePath(TRAFFIC.out)} fill="none" stroke="#5aa9f7" strokeWidth={1.8} />

        {/* X labels */}
        {TRAFFIC.labels.map((lab, i) => {
          const xi = pad.l + (i / (TRAFFIC.labels.length - 1)) * (W - pad.l - pad.r);
          return (
            <text key={lab} x={xi} y={H - 6} textAnchor="middle" className="fill-[var(--color-faint)]" fontSize={10}>
              {lab}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* Overview tab ------------------------------------------------------------- */
function OverviewTab() {
  const running = SERVICE.status === "running";
  return (
    <div className="space-y-6 fade-up">
      {/* Top row: info / resources / quick actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Service info */}
        <div className="card p-5">
          <h3 className="mb-2 text-sm font-semibold">Thông tin dịch vụ</h3>
          <div className="divide-y divide-[var(--color-border-soft)]">
            <InfoRow label="Tên dịch vụ" value={SERVICE.name} />
            <InfoRow label="Mô tả" value={SERVICE.description} />
            <InfoRow
              label="Trạng thái"
              value={
                <span className="inline-flex items-center gap-1.5 text-[var(--color-accent)]">
                  <span className="dot" /> {running ? "Running" : "Stopped"}
                </span>
              }
            />
            <InfoRow label="Uptime" value={SERVICE.uptime} />
            <InfoRow
              label="Tự động khởi động"
              value={
                <span className="text-[var(--color-accent)]">
                  {SERVICE.autostart ? "✓ Bật" : "Tắt"}
                </span>
              }
            />
            <InfoRow label="Người dùng" value={SERVICE.user} />
            <InfoRow label="Nhóm" value={SERVICE.group} />
            <InfoRow label="Process ID" value={SERVICE.pid} />
            <InfoRow label="Phiên bản" value={SERVICE.version} />
          </div>
        </div>

        {/* Resource usage */}
        <div className="card p-5">
          <h3 className="mb-5 text-sm font-semibold">Tài nguyên sử dụng</h3>
          <div className="flex flex-wrap items-start justify-around gap-4">
            <ServiceGauge percent={RESOURCES.cpu.percent} label="CPU" value={RESOURCES.cpu.value} caption={RESOURCES.cpu.caption} />
            <ServiceGauge percent={RESOURCES.ram.percent} label="RAM" value={RESOURCES.ram.value} caption={RESOURCES.ram.caption} />
            <ServiceGauge percent={RESOURCES.disk.percent} label="Disk (Read/Write)" value={RESOURCES.disk.value} caption={RESOURCES.disk.caption} />
          </div>
        </div>

        {/* Quick actions */}
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold">Thao tác nhanh</h3>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[#0e1412] px-3.5 py-2.5 text-left text-sm transition-colors hover:border-[#2f3f37] hover:bg-[var(--color-panel-2)]"
              >
                <span className="text-[var(--color-fg)]">{a.label}</span>
                <IconChevron className="h-4 w-4 -rotate-90 text-[var(--color-faint)]" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: ports / traffic */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Listening ports */}
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Port đang lắng nghe</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                  <th className="pb-2 font-medium">Port</th>
                  <th className="pb-2 font-medium">Protocol</th>
                  <th className="pb-2 font-medium">Địa chỉ</th>
                  <th className="pb-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {PORTS.map((p, i) => (
                  <tr key={i} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className="py-2.5 font-medium font-[family-name:var(--font-mono)]">{p.port}</td>
                    <td className="py-2.5 text-[var(--color-muted)]">{p.protocol}</td>
                    <td className="py-2.5 font-[family-name:var(--font-mono)] text-[var(--color-muted)]">{p.address}</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-accent)]">
                        <span className="dot" /> Listening
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Hiển thị 1–{PORTS.length} của {PORTS.length}</span>
            <div className="flex items-center gap-1">
              <button className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-faint)]" disabled>
                <IconChevron className="h-3.5 w-3.5 rotate-90" />
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-md border border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] text-xs font-semibold text-[var(--color-accent)]">
                1
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-faint)]" disabled>
                <IconChevron className="h-3.5 w-3.5 -rotate-90" />
              </button>
            </div>
          </div>
        </div>

        {/* Traffic chart */}
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Biểu đồ lưu lượng{" "}
              <span className="font-normal text-[var(--color-muted)]">(7 ngày qua)</span>
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
                <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" /> In (MB/s)
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
                <span className="h-2 w-2 rounded-full bg-[#5aa9f7]" /> Out (MB/s)
              </span>
            </div>
          </div>
          <TrafficChart />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-[var(--color-accent)]">Tổng In: {TRAFFIC.totalIn}</span>
            <span className="text-[#5aa9f7]">Tổng Out: {TRAFFIC.totalOut}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Logs tab ----------------------------------------------------------------- */
function LogsTab() {
  const [autoScroll, setAutoScroll] = useState(true);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOGS;
    return LOGS.filter(
      (r) =>
        r.ip.includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q) ||
        String(r.status).includes(q)
    );
  }, [query]);

  return (
    <div className="card fade-up p-5">
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Logs</h3>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost text-sm">⤓ Tải xuống</button>
          <button className="btn btn-danger text-sm">🗑 Xóa logs</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input max-w-[140px]" defaultValue="nginx" aria-label="Dịch vụ">
          <option value="nginx">nginx</option>
          <option value="php-fpm">php-fpm</option>
          <option value="mysql">mysql</option>
        </select>
        <select className="input max-w-[150px]" defaultValue="access.log" aria-label="Tệp log">
          <option value="access.log">access.log</option>
          <option value="error.log">error.log</option>
        </select>
        <input className="input max-w-[160px]" type="date" defaultValue="2024-05-18" aria-label="Ngày" />
        <div className="relative min-w-[180px] flex-1">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trong logs..."
            aria-label="Tìm trong logs"
          />
        </div>
        <label className="flex select-none items-center gap-2 text-sm text-[var(--color-muted)]">
          Tự động cuộn
          <button
            type="button"
            role="switch"
            aria-checked={autoScroll}
            onClick={() => setAutoScroll((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              autoScroll ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                autoScroll ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
              <th className="px-2 pb-2.5 font-medium">Thời gian</th>
              <th className="px-2 pb-2.5 font-medium">IP</th>
              <th className="px-2 pb-2.5 font-medium">Phương thức</th>
              <th className="px-2 pb-2.5 font-medium">URL</th>
              <th className="px-2 pb-2.5 font-medium">Trạng thái</th>
              <th className="px-2 pb-2.5 font-medium">Kích thước</th>
              <th className="px-2 pb-2.5 font-medium">Referrer</th>
              <th className="px-2 pb-2.5 font-medium">User-Agent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className="border-b border-[var(--color-border-soft)] last:border-0 transition-colors hover:bg-[var(--color-panel-2)]"
              >
                <td className="whitespace-nowrap px-2 py-3 text-[var(--color-muted)] font-[family-name:var(--font-mono)]">{r.time}</td>
                <td className="whitespace-nowrap px-2 py-3 font-[family-name:var(--font-mono)]">{r.ip}</td>
                <td className="px-2 py-3 font-medium">{r.method}</td>
                <td className="px-2 py-3 font-[family-name:var(--font-mono)]">{r.url}</td>
                <td className="px-2 py-3 font-semibold tabular-nums" style={{ color: statusColor(r.status) }}>{r.status}</td>
                <td className="whitespace-nowrap px-2 py-3 text-[var(--color-muted)] tabular-nums">{r.size}</td>
                <td className="max-w-[180px] truncate px-2 py-3 text-[var(--color-muted)]" title={r.referrer}>{r.referrer}</td>
                <td className="max-w-[240px] truncate px-2 py-3 text-[var(--color-muted)]" title={r.agent}>{r.agent}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-8 text-center text-sm text-[var(--color-muted)]">
                  Không có dòng log nào khớp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-muted)]">
        <span>Hiển thị 1–10 của 1,248 dòng</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <PageBtn disabled><IconChevron className="h-3.5 w-3.5 rotate-90" /></PageBtn>
            <PageBtn active>1</PageBtn>
            <PageBtn>2</PageBtn>
            <PageBtn>3</PageBtn>
            <span className="px-1 text-[var(--color-faint)]">…</span>
            <PageBtn>125</PageBtn>
            <PageBtn><IconChevron className="h-3.5 w-3.5 -rotate-90" /></PageBtn>
          </div>
          <select className="input max-w-[110px] py-1.5 text-xs" defaultValue="10">
            <option value="10">10 / trang</option>
            <option value="25">25 / trang</option>
            <option value="50">50 / trang</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function PageBtn({
  children,
  active,
  disabled,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`grid h-7 min-w-7 place-items-center rounded-md border px-2 text-xs font-semibold transition-colors ${
        active
          ? "border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] disabled:text-[var(--color-faint)] disabled:hover:text-[var(--color-faint)]"
      }`}
    >
      {children}
    </button>
  );
}

/* Simple placeholder tabs (not detailed in the mockups) -------------------- */
function PlaceholderTab({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card fade-up p-8 text-center">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{hint}</p>
    </div>
  );
}

/* Page --------------------------------------------------------------------- */
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "logs", label: "Logs" },
  { key: "configuration", label: "Configuration" },
  { key: "metrics", label: "Metrics" },
  { key: "processes", label: "Processes" },
];

export default function ServiceDetailPage() {
  const params = useParams<{ id: string; name: string }>();
  const serverId = params.id;
  const [tab, setTab] = useState("overview");
  const running = SERVICE.status === "running";

  return (
    <>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
        <Link href="/" className="transition-colors hover:text-[var(--color-fg)]">Servers</Link>
        <span className="text-[var(--color-faint)]">/</span>
        <Link href={`/servers/${serverId}`} className="transition-colors hover:text-[var(--color-fg)]">Web Production</Link>
        <span className="text-[var(--color-faint)]">/</span>
        <span>Services</span>
        <span className="text-[var(--color-faint)]">/</span>
        <span className="text-[var(--color-fg)]">{SERVICE.name}</span>
      </nav>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[var(--color-accent-soft)] text-xl font-bold text-[var(--color-accent)]">
            N
          </span>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{SERVICE.name}</h1>
              <span className={`pill ${running ? "pill-on" : "pill-down"}`}>
                <span className="dot" /> {running ? "Running" : "Stopped"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              <span className="font-[family-name:var(--font-mono)]">{SERVICE.unit}</span>
              {" • "}
              {SERVICE.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-ghost">↻ Restart</button>
          <button className="btn btn-danger">◼ Stop</button>
          <button className="btn btn-ghost px-3" aria-label="Thêm thao tác">⋯</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* Content */}
      <div className="mt-6">
        {tab === "overview" && <OverviewTab />}
        {tab === "logs" && <LogsTab />}
        {tab === "configuration" && (
          <PlaceholderTab title="Configuration" hint="Trình chỉnh sửa cấu hình nginx sẽ hiển thị tại đây." />
        )}
        {tab === "metrics" && (
          <PlaceholderTab title="Metrics" hint="Biểu đồ chỉ số chi tiết (CPU, RAM, requests/s) sẽ hiển thị tại đây." />
        )}
        {tab === "processes" && (
          <PlaceholderTab title="Processes" hint="Danh sách process của dịch vụ sẽ hiển thị tại đây." />
        )}
      </div>
    </>
  );
}
