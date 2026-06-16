"use client";

import type { ServerData } from "@/components/ServerForm";
import { platformBadge, type Platform } from "@/lib/platform";
import Link from "next/link";
import MetricBar from "./MetricBar";
import { IconChat, IconExternal, IconSettings, IconTrash } from "./icons";

export type ServerStatus = "online" | "offline" | "checking";

export interface ServerMetrics {
  status: ServerStatus;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  /** Detected control panel / web server from the overview fetch (may be undefined while loading). */
  platform?: Platform;
}

interface Server extends ServerData {
  id: string;
}

function hostLine(s: Server): string {
  if (s.ssh?.enabled && s.ssh.host) {
    return `${s.ssh.username || "root"}@${s.ssh.host}:${s.ssh.port ?? 22}`;
  }
  if (s.aapanel?.enabled && s.aapanel.base_url) {
    try {
      return new URL(s.aapanel.base_url).host;
    } catch {
      return s.aapanel.base_url;
    }
  }
  return "Chưa cấu hình kết nối";
}

function StatusPill({ status }: { status: ServerStatus }) {
  if (status === "online") {
    return (
      <span className="pill pill-on">
        <span className="dot" />
        Online
      </span>
    );
  }
  if (status === "checking") {
    return (
      <span className="pill" style={{ color: "var(--color-warn)", borderColor: "#3a2f10", backgroundColor: "var(--color-warn-soft)" }}>
        <span className="dot pulse" />
        Đang kiểm tra
      </span>
    );
  }
  return (
    <span className="pill pill-down">
      <span className="dot" />
      Offline
    </span>
  );
}

export default function ServerCard({
  server,
  metrics,
  lastChecked,
  onDelete,
}: {
  server: Server;
  metrics: ServerMetrics;
  /** ISO string of last service check for this server, or null. */
  lastChecked: string | null;
  onDelete: (server: Server) => void;
}) {
  const monitoring = server.monitor?.enabled;
  const offline = metrics.status === "offline";
  // Show the platform badge once the overview fetch resolves (platform set, even if null).
  const badge = metrics.platform !== undefined ? platformBadge(metrics.platform) : null;

  return (
    <div className="card flex flex-col p-5 transition-all hover:border-[#2f3f37] hover:-translate-y-0.5 fade-up">
      {/* Header: name + status + platform badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate font-semibold">{server.name}</h3>
          {badge && (
            <span
              className={`inline-flex flex-none items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
        </div>
        <StatusPill status={metrics.status} />
      </div>

      {/* Host */}
      <p className="mt-1 truncate text-xs text-[var(--color-faint)] font-[family-name:var(--font-mono)]">
        {hostLine(server)}
      </p>

      {/* Metric bars */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <MetricBar label="CPU" percent={offline ? null : metrics.cpu} />
        <MetricBar label="RAM" percent={offline ? null : metrics.mem} />
        <MetricBar label="Disk" percent={offline ? null : metrics.disk} />
      </div>

      {/* Monitoring + last checked */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {monitoring ? (
          <span className="pill pill-on">
            <span className="dot" />
            Đang giám sát
          </span>
        ) : (
          <span className="pill pill-off">
            <span className="dot" />
            Tắt giám sát
          </span>
        )}
        <span className="text-[11px] text-[var(--color-faint)]">
          Kiểm tra:{" "}
          {lastChecked
            ? new Date(lastChecked).toLocaleString("vi-VN")
            : "—"}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2 border-t border-[var(--color-border-soft)] pt-4">
        <Link href={`/servers/${server.id}`} className="btn btn-primary flex-1 py-1.5 text-sm">
          <IconExternal className="h-4 w-4" />
          Mở
        </Link>
        <Link
          href={`/servers/${server.id}?tab=chat`}
          className="btn btn-ghost py-1.5 text-sm"
          aria-label="Chat AI"
          title="Chat AI"
        >
          <IconChat className="h-4 w-4" />
        </Link>
        <Link
          href={`/servers/${server.id}?tab=settings`}
          className="btn btn-ghost py-1.5 text-sm"
          aria-label="Sửa"
          title="Sửa"
        >
          <IconSettings className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => onDelete(server)}
          className="btn btn-danger py-1.5 text-sm"
          aria-label="Xóa server"
          title="Xóa"
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
