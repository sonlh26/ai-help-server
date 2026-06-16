"use client";

import Tabs from "@/components/Tabs";
import {
  IconChat,
  IconChevron,
  IconExternal,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
} from "@/components/shell/icons";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

/* ===========================================================================
   Server detail — "Sites" tab (recreated from the design mockup).

   Faithful UI rebuild. Sample data lives in one place so it can later be
   swapped for a real API response (e.g. GET /api/be/servers/{id}/sites).
=========================================================================== */

const SERVER = {
  name: "Web Production",
  ip: "203.0.113.10",
  os: "Ubuntu 22.04.4 LTS",
  uptime: "15 ngày 4 giờ",
  online: true,
};

type SiteStatus = "running" | "stopped";
type SslStatus = "valid" | "expiring" | "none";

interface Site {
  id: string;
  domain: string;
  status: SiteStatus;
  ssl: SslStatus;
  sslExpiry: string; // e.g. "12/07/2025 (58 ngày)" or "-"
  detail: {
    documentRoot: string;
    webServer: string;
    phpVersion: string;
    createdAt: string;
    lastModified: string;
    sslCertificate: string;
    accessLog: string;
    errorLog: string;
    rewrite: string;
  };
}

const SITES: Site[] = [
  {
    id: "example",
    domain: "example.com",
    status: "running",
    ssl: "valid",
    sslExpiry: "12/07/2025 (58 ngày)",
    detail: {
      documentRoot: "/var/www/example.com/public",
      webServer: "nginx",
      phpVersion: "8.2",
      createdAt: "10/01/2025 09:00:00",
      lastModified: "17/05/2025 11:02:41",
      sslCertificate: "Let's Encrypt",
      accessLog: "/var/log/nginx/example.com.access.log",
      errorLog: "/var/log/nginx/example.com.error.log",
      rewrite: "Không có",
    },
  },
  {
    id: "shop",
    domain: "shop.example.com",
    status: "running",
    ssl: "expiring",
    sslExpiry: "28/05/2025 (13 ngày)",
    detail: {
      documentRoot: "/var/www/shop.example.com/public",
      webServer: "nginx",
      phpVersion: "8.2",
      createdAt: "12/01/2025 14:20:00",
      lastModified: "18/05/2025 08:11:09",
      sslCertificate: "Let's Encrypt",
      accessLog: "/var/log/nginx/shop.example.com.access.log",
      errorLog: "/var/log/nginx/shop.example.com.error.log",
      rewrite: "WordPress",
    },
  },
  {
    id: "blog",
    domain: "blog.example.com",
    status: "running",
    ssl: "valid",
    sslExpiry: "10/09/2025 (117 ngày)",
    detail: {
      documentRoot: "/var/www/blog.example.com/public",
      webServer: "nginx",
      phpVersion: "8.1",
      createdAt: "05/02/2025 10:30:00",
      lastModified: "16/05/2025 19:45:00",
      sslCertificate: "Let's Encrypt",
      accessLog: "/var/log/nginx/blog.example.com.access.log",
      errorLog: "/var/log/nginx/blog.example.com.error.log",
      rewrite: "WordPress",
    },
  },
  {
    id: "api",
    domain: "api.example.com",
    status: "stopped",
    ssl: "none",
    sslExpiry: "-",
    detail: {
      documentRoot: "/var/www/api.example.com/public",
      webServer: "nginx",
      phpVersion: "8.2",
      createdAt: "18/01/2025 10:15:22",
      lastModified: "18/05/2025 14:22:10",
      sslCertificate: "Chưa cài đặt",
      accessLog: "/var/log/nginx/api.example.com.access.log",
      errorLog: "/var/log/nginx/api.example.com.error.log",
      rewrite: "Không có",
    },
  },
  {
    id: "dev",
    domain: "dev.example.com",
    status: "running",
    ssl: "none",
    sslExpiry: "-",
    detail: {
      documentRoot: "/var/www/dev.example.com/public",
      webServer: "nginx",
      phpVersion: "8.3",
      createdAt: "20/03/2025 16:00:00",
      lastModified: "18/05/2025 09:30:00",
      sslCertificate: "Chưa cài đặt",
      accessLog: "/var/log/nginx/dev.example.com.access.log",
      errorLog: "/var/log/nginx/dev.example.com.error.log",
      rewrite: "Không có",
    },
  },
  {
    id: "test",
    domain: "test.example.com",
    status: "stopped",
    ssl: "none",
    sslExpiry: "-",
    detail: {
      documentRoot: "/var/www/test.example.com/public",
      webServer: "nginx",
      phpVersion: "8.2",
      createdAt: "01/04/2025 12:00:00",
      lastModified: "15/05/2025 22:10:00",
      sslCertificate: "Chưa cài đặt",
      accessLog: "/var/log/nginx/test.example.com.access.log",
      errorLog: "/var/log/nginx/test.example.com.error.log",
      rewrite: "Không có",
    },
  },
];

/* Small inline icons not in the shared set ---------------------------------- */
function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}
function IconServerBox({ className }: { className?: string }) {
  return (
    <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  );
}

/* SSL status badge --------------------------------------------------------- */
function SslBadge({ status }: { status: SslStatus }) {
  if (status === "valid") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent-soft)] px-2 py-1 text-xs font-medium text-[var(--color-accent)]">
        <IconLock className="h-3.5 w-3.5" /> Valid
      </span>
    );
  }
  if (status === "expiring") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-warn-soft)] px-2 py-1 text-xs font-medium text-[var(--color-warn)]">
        <IconClock className="h-3.5 w-3.5" /> Expiring soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-[#0e1412] px-2 py-1 text-xs font-medium text-[var(--color-faint)]">
      None
    </span>
  );
}

/* Detail row line ---------------------------------------------------------- */
function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-32 flex-none text-[var(--color-muted)]">{label}</span>
      <span className="min-w-0 break-words text-[var(--color-fg)] font-[family-name:var(--font-mono)]">{value}</span>
    </div>
  );
}

/* Log / cert reference with external-open affordance ----------------------- */
function LogRef({ title, value, external }: { title: string; value: string; external?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className="mt-0.5 text-[var(--color-faint)]">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--color-fg)]">{title}</div>
        <div className="truncate text-xs text-[var(--color-muted)] font-[family-name:var(--font-mono)]" title={value}>
          {value}
        </div>
      </div>
      {external && (
        <button className="mt-0.5 text-[var(--color-faint)] transition-colors hover:text-[var(--color-accent)]" aria-label={`Mở ${title}`}>
          <IconExternal className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* Empty state (shown only when there are no sites) ------------------------- */
function EmptyState() {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-20 w-24 place-items-center rounded-xl border border-[var(--color-border)] bg-[#0e1412] text-[var(--color-faint)]">
        <svg width={42} height={42} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M3 8h18M7 6h.01M10 6h.01" />
          <circle cx="17" cy="15" r="3" className="stroke-[var(--color-accent)]" />
          <path d="M17 13.6v2.8M15.6 15h2.8" className="stroke-[var(--color-accent)]" />
        </svg>
      </div>
      <h3 className="text-base font-semibold">Chưa có website</h3>
      <p className="mt-1.5 text-sm text-[var(--color-muted)]">Thêm website đầu tiên để bắt đầu.</p>
      <button className="btn btn-primary mt-5">
        <IconPlus className="h-4 w-4" /> Thêm website
      </button>
    </div>
  );
}

/* Expanded website detail -------------------------------------------------- */
function SiteDetail({ site }: { site: Site }) {
  const d = site.detail;
  return (
    <div className="grid gap-6 rounded-lg border border-[var(--color-border)] bg-[#0e1412] p-5 lg:grid-cols-[1.2fr_1.2fr_1fr]">
      {/* Column 1: info */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-[var(--color-accent)]">Chi tiết website</h4>
        <DetailLine label="Document Root" value={d.documentRoot} />
        <DetailLine label="Web Server" value={d.webServer} />
        <DetailLine label="PHP Version" value={d.phpVersion} />
        <DetailLine label="Created At" value={d.createdAt} />
        <DetailLine label="Last Modified" value={d.lastModified} />
      </div>

      {/* Column 2: cert + logs */}
      <div className="lg:border-l lg:border-[var(--color-border-soft)] lg:pl-6">
        <LogRef title="SSL Certificate" value={d.sslCertificate} />
        <LogRef title="Access Log" value={d.accessLog} external />
        <LogRef title="Error Log" value={d.errorLog} external />
        <LogRef title="Rewrite" value={d.rewrite} />
      </div>

      {/* Column 3: quick actions */}
      <div className="lg:border-l lg:border-[var(--color-border-soft)] lg:pl-6">
        <h4 className="mb-3 text-sm font-semibold">Thao tác nhanh</h4>
        <div className="space-y-2">
          <button className="btn btn-ghost w-full justify-start text-sm">
            <IconSettings className="h-4 w-4" /> Edit Config
          </button>
          <button className="btn btn-ghost w-full justify-start text-sm">
            <IconLock className="h-4 w-4" /> SSL
          </button>
          <button className="btn btn-ghost w-full justify-start text-sm">
            <span className="font-[family-name:var(--font-mono)] text-xs">&lt;/&gt;</span> PHP Settings
          </button>
          <button className="btn btn-danger w-full justify-start text-sm">
            <IconTrash className="h-4 w-4" /> Xóa website
          </button>
        </div>
      </div>
    </div>
  );
}

/* Sites tab ---------------------------------------------------------------- */
function SitesTab() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | SiteStatus>("all");
  const [expanded, setExpanded] = useState<string | null>("api"); // matches mockup

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SITES.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (q && !s.domain.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, filter]);

  if (SITES.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="fade-up space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--color-faint)]" />
          <input
            className="input pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm website..."
            aria-label="Tìm website"
          />
        </div>
        <select
          className="input max-w-[200px]"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | SiteStatus)}
          aria-label="Lọc theo trạng thái"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
        </select>
        <span className="text-sm text-[var(--color-muted)]">{SITES.length} websites</span>
        <button className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]" aria-label="Làm mới">
          <IconRefresh className="h-4 w-4" />
        </button>
        <button className="btn btn-primary">
          <IconPlus className="h-4 w-4" /> Thêm website
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                <th className="px-5 py-3 font-medium">Domain</th>
                <th className="px-5 py-3 font-medium">Trạng thái</th>
                <th className="px-5 py-3 font-medium">SSL status</th>
                <th className="px-5 py-3 font-medium">Hết hạn SSL</th>
                <th className="px-5 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const isOpen = expanded === s.id;
                const running = s.status === "running";
                return (
                  <FragmentRow
                    key={s.id}
                    site={s}
                    isOpen={isOpen}
                    running={running}
                    onToggle={() => setExpanded(isOpen ? null : s.id)}
                  />
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-[var(--color-muted)]">
                    Không tìm thấy website phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-muted)]">
          <span>Hiển thị 1–{SITES.length} của {SITES.length} website</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-faint)]" disabled>
                <IconChevron className="h-3.5 w-3.5 rotate-90" />
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-md border border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] text-xs font-semibold text-[var(--color-accent)]">1</button>
              <button className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-faint)]" disabled>
                <IconChevron className="h-3.5 w-3.5 -rotate-90" />
              </button>
            </div>
            <select className="input max-w-[110px] py-1.5 text-xs" defaultValue="10">
              <option value="10">10 / trang</option>
              <option value="25">25 / trang</option>
              <option value="50">50 / trang</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/* One table row + its (optional) expanded detail row ----------------------- */
function FragmentRow({
  site,
  isOpen,
  running,
  onToggle,
}: {
  site: Site;
  isOpen: boolean;
  running: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`cursor-pointer border-b border-[var(--color-border-soft)] transition-colors hover:bg-[var(--color-panel-2)] ${
          isOpen ? "bg-[var(--color-panel-2)]" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-5 py-3.5">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-accent)]">
            {site.domain}
            <IconExternal className="h-3.5 w-3.5 text-[var(--color-faint)]" />
          </span>
        </td>
        <td className="px-5 py-3.5">
          <span className={`inline-flex items-center gap-1.5 ${running ? "text-[var(--color-accent)]" : "text-[var(--color-danger)]"}`}>
            <span className="dot" /> {running ? "Running" : "Stopped"}
          </span>
        </td>
        <td className="px-5 py-3.5">
          <SslBadge status={site.ssl} />
        </td>
        <td className="px-5 py-3.5 text-[var(--color-muted)] font-[family-name:var(--font-mono)]">{site.sslExpiry}</td>
        <td className="px-5 py-3.5">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {running ? (
              <button className="btn btn-danger px-3 py-1.5 text-xs">◼ Stop</button>
            ) : (
              <button className="btn btn-ghost px-3 py-1.5 text-xs text-[var(--color-accent)]">▶ Start</button>
            )}
            <button className="btn btn-ghost px-2.5 py-1.5 text-xs" aria-label="Thêm thao tác">⋯</button>
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[var(--color-border-soft)]">
          <td colSpan={5} className="px-5 pb-5 pt-1">
            <SiteDetail site={site} />
          </td>
        </tr>
      )}
    </>
  );
}

/* Placeholder tabs (not detailed in this mockup) --------------------------- */
function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="card fade-up p-8 text-center">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Nội dung tab {title} sẽ hiển thị tại đây.</p>
    </div>
  );
}

/* Page --------------------------------------------------------------------- */
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "disk", label: "Disk" },
  { key: "services", label: "Services" },
  { key: "sites", label: "Sites" },
  { key: "databases", label: "Databases" },
  { key: "cron", label: "Cron" },
  { key: "logs", label: "Logs" },
  { key: "security", label: "Security" },
  { key: "metrics", label: "Metrics" },
];

export default function ServerSitesPage() {
  const params = useParams<{ id: string }>();
  const serverId = params.id;
  const [tab, setTab] = useState("sites");

  return (
    <>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
        <Link href="/" className="transition-colors hover:text-[var(--color-fg)]">Servers</Link>
        <span className="text-[var(--color-faint)]">/</span>
        <span className="text-[var(--color-fg)]">{SERVER.name}</span>
      </nav>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <IconServerBox className="h-6 w-6" />
          </span>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{SERVER.name}</h1>
              <span className={`pill ${SERVER.online ? "pill-on" : "pill-down"}`}>
                <span className="dot" /> {SERVER.online ? "Online" : "Offline"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              <span className="font-[family-name:var(--font-mono)]">{SERVER.ip}</span>
              {" • "}{SERVER.os}{" • "}Uptime: {SERVER.uptime}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/chat?server=${serverId}`} className="btn btn-ghost">
            <IconChat className="h-4 w-4" /> Chat AI
          </Link>
          <button className="btn btn-ghost">
            <IconRefresh className="h-4 w-4" /> Refresh
          </button>
          <button className="btn btn-ghost px-3" aria-label="Thêm thao tác">⋯</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 overflow-x-auto">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* Content */}
      <div className="mt-6">
        {tab === "sites" ? <SitesTab /> : <PlaceholderTab title={TABS.find((t) => t.key === tab)?.label ?? ""} />}
      </div>
    </>
  );
}
