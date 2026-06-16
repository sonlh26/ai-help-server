"use client";

import { IconExternal } from "@/components/shell/icons";
import { IconRefresh } from "@/components/server/icons";
import {
  PageHeader,
  Pagination,
  SegTabs,
  Toast,
  relativeTime,
  useToast,
} from "@/components/admin/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/* Types -------------------------------------------------------------------- */
interface Alert {
  id: number;
  server_id: string;
  user_id: string;
  level: string;
  message: string;
  read_at: string | null;
  created_at: string;
}
interface Counts {
  total: number;
  unread: number;
  read: number;
}
interface AlertsResp {
  alerts: Alert[];
  services: unknown[];
  counts: Counts;
}
interface ServerLite {
  id: string;
  name: string;
}

const PAGE_SIZE = 10;

/** Level → display label + severity color (by level string). */
function levelMeta(level: string): { label: string; color: string; soft: string; border: string } {
  switch (level) {
    case "error":
      return {
        label: "CRITICAL",
        color: "var(--color-danger)",
        soft: "var(--color-danger-soft)",
        border: "#46211f",
      };
    case "warning":
      return {
        label: "WARNING",
        color: "var(--color-warn)",
        soft: "var(--color-warn-soft)",
        border: "#3a2f10",
      };
    case "info":
      return {
        label: "INFO",
        color: "#5aa9ff",
        soft: "rgba(90,169,255,0.08)",
        border: "rgba(90,169,255,0.25)",
      };
    default:
      return {
        label: (level || "INFO").toUpperCase(),
        color: "var(--color-muted)",
        soft: "#0e1412",
        border: "var(--color-border)",
      };
  }
}

export default function AlertsPage() {
  const [data, setData] = useState<AlertsResp | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState<ServerLite[]>([]);
  const [serverNames, setServerNames] = useState<Record<string, string>>({});

  // Filters
  const [serverId, setServerId] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState(""); // "", "unread", "read"
  const [tab, setTab] = useState("all"); // all | unread | read
  const [page, setPage] = useState(1);

  const [toast, showToast, clearToast] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (level) qs.set("level", level);
      if (status) qs.set("status", status);
      if (serverId) qs.set("server_id", serverId);
      const res = await fetch(`/api/be/alerts?${qs.toString()}`);
      if (!res.ok) throw new Error("fetch");
      const d: AlertsResp = await res.json();
      setData({
        alerts: d.alerts ?? [],
        services: d.services ?? [],
        counts: d.counts ?? { total: 0, unread: 0, read: 0 },
      });
    } catch {
      setError("Không thể tải cảnh báo. Vui lòng thử lại.");
      setData({ alerts: [], services: [], counts: { total: 0, unread: 0, read: 0 } });
    } finally {
      setLoading(false);
    }
  }, [level, status, serverId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/be/servers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown) => {
        const list = Array.isArray(d) ? (d as ServerLite[]) : [];
        setServers(list);
        const map: Record<string, string> = {};
        for (const s of list) map[String(s.id)] = s.name;
        setServerNames(map);
      })
      .catch(() => {});
  }, []);

  const serverLabel = (id: string) => serverNames[String(id)] ?? `server #${id}`;

  // Tab → status filter (tab drives status; keep them in sync)
  function setTabAndStatus(next: string) {
    setTab(next);
    setStatus(next === "all" ? "" : next);
    setPage(1);
  }

  // Distinct levels present in current data (for level filter options)
  const distinctLevels = useMemo(() => {
    const set = new Set<string>();
    for (const a of data?.alerts ?? []) set.add(a.level);
    return Array.from(set);
  }, [data]);

  const counts = data?.counts ?? { total: 0, unread: 0, read: 0 };
  const alerts = data?.alerts ?? [];

  // Client-side pagination
  const pageCount = Math.max(1, Math.ceil(alerts.length / PAGE_SIZE));
  const pageAlerts = alerts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);

  async function markRead(id: number) {
    try {
      await fetch(`/api/be/alerts/${id}/read`, { method: "POST" });
      await load();
    } catch {
      showToast("Không thể đánh dấu đã đọc.", "error");
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/be/alerts/read-all", { method: "POST" });
      await load();
      showToast("Đã đánh dấu tất cả là đã đọc.");
    } catch {
      showToast("Không thể đánh dấu tất cả.", "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Cảnh báo"
        subtitle="Sự kiện giám sát và trạng thái dịch vụ trên các server."
      />

      {/* Toolbar: filters + refresh */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <select
          className="input w-auto py-2 text-sm"
          value={serverId}
          onChange={(e) => {
            setServerId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả server</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          className="input w-auto py-2 text-sm"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả mức độ</option>
          {distinctLevels.map((lv) => (
            <option key={lv} value={lv}>
              {levelMeta(lv).label}
            </option>
          ))}
        </select>

        <select
          className="input w-auto py-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setTab(e.target.value === "" ? "all" : e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="unread">Chưa đọc</option>
          <option value="read">Đã đọc</option>
        </select>

        <button className="btn btn-ghost py-2 text-sm" onClick={load} disabled={loading}>
          <IconRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>

      {/* Tabs + mark all */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <SegTabs
          active={tab}
          onChange={setTabAndStatus}
          tabs={[
            { key: "all", label: `Tất cả ${counts.total}` },
            { key: "unread", label: `Chưa đọc ${counts.unread}` },
            { key: "read", label: `Đã đọc ${counts.read}` },
          ]}
        />
        <button
          className="btn btn-ghost py-2 text-sm"
          onClick={markAllRead}
          disabled={loading || counts.unread === 0}
        >
          Đánh dấu tất cả đã đọc
        </button>
      </div>

      {/* List */}
      <div className="mt-5">
        {error ? (
          <div className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        ) : data === null ? (
          <div className="card p-10 text-center text-sm text-[var(--color-muted)]">
            Đang tải cảnh báo…
          </div>
        ) : alerts.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-sm font-medium text-[var(--color-fg)]">Không có cảnh báo nào</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Mọi thứ đang ổn định. Cảnh báo mới sẽ xuất hiện tại đây.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {pageAlerts.map((a) => {
              const m = levelMeta(a.level);
              const lines = (a.message || "").split("\n");
              const title = lines[0];
              const desc = lines.slice(1).join("\n").trim();
              const unread = a.read_at === null;
              return (
                <li
                  key={a.id}
                  className="card flex items-stretch gap-0 overflow-hidden fade-up"
                >
                  {/* Severity bar */}
                  <span
                    className="w-1 flex-none"
                    style={{ backgroundColor: m.color }}
                    aria-hidden
                  />
                  <div className="flex flex-1 items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="pill"
                          style={{
                            color: m.color,
                            borderColor: m.border,
                            backgroundColor: m.soft,
                          }}
                        >
                          <span className="dot" />
                          {m.label}
                        </span>
                        {unread && (
                          <span
                            className="pill"
                            style={{
                              color: "var(--color-danger)",
                              borderColor: "#46211f",
                              backgroundColor: "var(--color-danger-soft)",
                            }}
                          >
                            Chưa đọc
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-medium text-[var(--color-fg)]">{title}</p>
                      {desc && (
                        <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-muted)]">
                          {desc}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-[var(--color-faint)]">
                        {serverLabel(a.server_id)} · {relativeTime(a.created_at)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-none items-center gap-1">
                      {unread && (
                        <button
                          className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-accent)]"
                          title="Đánh dấu đã đọc"
                          aria-label="Đánh dấu đã đọc"
                          onClick={() => markRead(a.id)}
                        >
                          <svg
                            width={18}
                            height={18}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </button>
                      )}
                      <Link
                        href={`/servers/${a.server_id}`}
                        className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-fg)]"
                        title="Mở server"
                        aria-label="Mở server"
                      >
                        <IconExternal className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Pagination page={page} pageCount={pageCount} onPage={setPage} />
      </div>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
