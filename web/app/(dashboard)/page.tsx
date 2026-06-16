"use client";

import ServerForm, { ServerData, ServerPayload } from "@/components/ServerForm";
import ServerCard, {
  type ServerMetrics,
  type ServerStatus,
} from "@/components/shell/ServerCard";
import { IconPlus, IconServers } from "@/components/shell/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* Types -------------------------------------------------------------------- */
interface Server extends ServerData {
  id: string;
}

interface OverviewResp {
  source: "aapanel" | "ssh" | null;
  system?: { cpu_percent?: number | null; mem_percent?: number | null };
  disks?: { percent: number }[];
  platform?: {
    panel: string | null;
    web_server: string | null;
    self_configured?: boolean;
  } | null;
  error?: string | null;
}

interface ServiceStatus {
  server_id: string;
  name: string;
  active: boolean;
  checked_at: string;
}

/* Empty state -------------------------------------------------------------- */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center fade-up">
      <div className="grid h-20 w-20 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <IconServers className="h-9 w-9" />
      </div>
      <h2 className="mt-5 text-lg font-semibold">Chưa có server nào</h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">
        Thêm server đầu tiên để bắt đầu giám sát tài nguyên, kiểm tra dịch vụ và
        trò chuyện với trợ lý AI.
      </p>
      <button className="btn btn-primary mt-6" onClick={onAdd}>
        <IconPlus className="h-4 w-4" />
        Thêm server đầu tiên
      </button>
    </div>
  );
}

/* Page --------------------------------------------------------------------- */
export default function ServersPage() {
  const [servers, setServers] = useState<Server[] | null>(null);
  const [metrics, setMetrics] = useState<Record<string, ServerMetrics>>({});
  const [lastChecked, setLastChecked] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // Guards against setState after unmount during parallel overview fetches.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Listen to the top-bar search box.
  useEffect(() => {
    function onSearch(e: Event) {
      setSearch((e as CustomEvent<string>).detail ?? "");
    }
    window.addEventListener("shell:search", onSearch);
    return () => window.removeEventListener("shell:search", onSearch);
  }, []);

  /** Fetch one server's overview and fold it into the metrics map. */
  const loadOverview = useCallback((serverId: string) => {
    setMetrics((m) => ({
      ...m,
      [serverId]: { status: "checking", cpu: null, mem: null, disk: null },
    }));
    fetch(`/api/be/servers/${serverId}/overview`)
      .then((r) => {
        if (!r.ok) throw new Error("status");
        return r.json() as Promise<OverviewResp>;
      })
      .then((d) => {
        if (!mounted.current) return;
        const offline = Boolean(d.error) || !d.source;
        const status: ServerStatus = offline ? "offline" : "online";
        const cpu = offline ? null : d.system?.cpu_percent ?? null;
        const mem = offline ? null : d.system?.mem_percent ?? null;
        const disk = offline ? null : d.disks?.[0]?.percent ?? null;
        // platform present (even null) signals the overview resolved → render badge.
        const platform = d.platform ?? null;
        setMetrics((m) => ({ ...m, [serverId]: { status, cpu, mem, disk, platform } }));
      })
      .catch(() => {
        if (!mounted.current) return;
        setMetrics((m) => ({
          ...m,
          [serverId]: { status: "offline", cpu: null, mem: null, disk: null },
        }));
      });
  }, []);

  const loadServers = useCallback(() => {
    fetch("/api/be/servers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown) => {
        const list = Array.isArray(d) ? (d as Server[]) : [];
        if (!mounted.current) return;
        setServers(list);
        // Fetch overviews in parallel.
        list.forEach((s) => loadOverview(s.id));
      })
      .catch(() => {
        if (mounted.current) setServers([]);
      });
  }, [loadOverview]);

  useEffect(() => {
    loadServers();
    // Last-checked timestamps come from service_status rows.
    fetch("/api/be/alerts")
      .then((r) => (r.ok ? r.json() : { services: [] }))
      .then((d: { services?: ServiceStatus[] }) => {
        if (!mounted.current) return;
        const latest: Record<string, string> = {};
        for (const s of d.services ?? []) {
          const id = String(s.server_id);
          if (!latest[id] || new Date(s.checked_at) > new Date(latest[id])) {
            latest[id] = s.checked_at;
          }
        }
        setLastChecked(latest);
      })
      .catch(() => {});
  }, [loadServers]);

  async function handleCreate(payload: ServerPayload) {
    setCreating(true);
    setCreateErr("");
    try {
      const res = await fetch("/api/be/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setCreateErr(d.detail || "Không thể tạo server.");
        return;
      }
      setShowCreate(false);
      loadServers();
    } catch {
      setCreateErr("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(server: Server) {
    if (!confirm(`Xóa server "${server.name}"? Hành động không thể hoàn tác.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/be/servers/${server.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadServers();
      } else {
        alert("Không thể xóa server.");
      }
    } catch {
      alert("Lỗi kết nối khi xóa server.");
    }
  }

  const filtered = useMemo(() => {
    if (!servers) return null;
    const q = search.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter((s) => {
      const host = s.ssh?.host ?? "";
      const base = s.aapanel?.base_url ?? "";
      return (
        s.name.toLowerCase().includes(q) ||
        host.toLowerCase().includes(q) ||
        base.toLowerCase().includes(q)
      );
    });
  }, [servers, search]);

  const defaultMetrics: ServerMetrics = {
    status: "checking",
    cpu: null,
    mem: null,
    disk: null,
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Servers của bạn</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            Quản lý kết nối, giám sát tài nguyên và trợ lý AI cho từng server.
          </p>
        </div>
        <button className="btn btn-primary flex-none" onClick={() => setShowCreate(true)}>
          <IconPlus className="h-4 w-4" />
          Thêm server
        </button>
      </div>

      {/* Content */}
      {servers === null ? (
        <div className="card p-10 text-center text-sm text-[var(--color-muted)]">
          Đang tải danh sách server…
        </div>
      ) : servers.length === 0 ? (
        <EmptyState onAdd={() => setShowCreate(true)} />
      ) : filtered && filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-muted)]">
          Không tìm thấy server khớp với “{search}”.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(filtered ?? []).map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              metrics={metrics[s.id] ?? defaultMetrics}
              lastChecked={lastChecked[s.id] ?? null}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm"
          onClick={() => !creating && setShowCreate(false)}
        >
          <div
            className="card w-full max-w-4xl p-6 fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Thêm server mới</h2>
              <button
                className="text-[var(--color-faint)] hover:text-[var(--color-fg)]"
                onClick={() => !creating && setShowCreate(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            {createErr && (
              <div className="mb-4 rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
                {createErr}
              </div>
            )}
            <ServerForm
              submitLabel="Tạo server"
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
              busy={creating}
            />
          </div>
        </div>
      )}
    </>
  );
}
