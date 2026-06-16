"use client";

import ChatPanel from "@/components/ChatPanel";
import ServerForm, { ServerData, ServerPayload } from "@/components/ServerForm";
import Tabs from "@/components/Tabs";
import AaPanelTab, { type Column } from "@/components/server/AaPanelTab";
import DatabasesTab from "@/components/server/DatabasesTab";
import DiskTab from "@/components/server/DiskTab";
import Modal from "@/components/server/Modal";
import OverviewTab from "@/components/server/OverviewTab";
import ServicesTab from "@/components/server/ServicesTab";
import {
  IconChat,
  IconClose,
  IconDots,
  IconEdit,
  IconRefresh,
  IconServer,
  IconTrash,
} from "@/components/server/icons";
import type { AaPanelRow, OverviewResp } from "@/components/server/types";
import { platformBadge } from "@/lib/platform";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/* Status pill from overview --------------------------------------------------- */
function StatusPill({ status }: { status: "online" | "offline" | "checking" }) {
  if (status === "online")
    return (
      <span className="pill pill-on">
        <span className="dot" /> Online
      </span>
    );
  if (status === "checking")
    return (
      <span
        className="pill"
        style={{
          color: "var(--color-warn)",
          borderColor: "#3a2f10",
          backgroundColor: "var(--color-warn-soft)",
        }}
      >
        <span className="dot pulse" /> Đang kiểm tra
      </span>
    );
  return (
    <span className="pill pill-down">
      <span className="dot" /> Offline
    </span>
  );
}

/* Kebab menu ------------------------------------------------------------------ */
function KebabMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn btn-ghost px-2.5 py-2"
        onClick={() => setOpen((o) => !o)}
        aria-label="Tùy chọn"
        aria-haspopup="menu"
      >
        <IconDots className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] py-1 shadow-xl fade-up">
          <button
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-fg)] hover:bg-[var(--color-panel-2)]"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <IconEdit className="h-4 w-4" /> Sửa
          </button>
          <button
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <IconTrash className="h-4 w-4" /> Xóa
          </button>
        </div>
      )}
    </div>
  );
}

/* Tabs config ----------------------------------------------------------------- */
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "disk", label: "Disk" },
  { key: "services", label: "Services" },
  { key: "sites", label: "Sites" },
  { key: "databases", label: "Databases" },
  { key: "cron", label: "Cron" },
];

/** Tabs that require the aaPanel API — hidden when aaPanel is disabled. */
const AAPANEL_ONLY_TABS = ["sites", "databases", "cron"];

const SITE_COLS: Column[] = [
  { key: "name", alts: ["domain", "ps"], label: "Tên miền / Site" },
  { key: "type", alts: ["project_type", "type_name"], label: "Loại" },
  {
    key: "status",
    label: "Trạng thái",
    render: (row: AaPanelRow) => {
      const s = row["status"];
      const on = s === "1" || s === 1 || s === true || s === "running";
      return (
        <span className={`pill ${on ? "pill-on" : "pill-off"}`}>
          <span className="dot" />
          {on ? "Đang chạy" : "Dừng"}
        </span>
      );
    },
  },
];

const CRON_COLS: Column[] = [
  { key: "name", label: "Tên tác vụ" },
  { key: "where1", alts: ["cycle", "schedule", "type"], label: "Lịch chạy", mono: true },
  {
    key: "status",
    label: "Trạng thái",
    render: (row: AaPanelRow) => {
      const s = row["status"];
      const on = s === "1" || s === 1 || s === true;
      return (
        <span className={`pill ${on ? "pill-on" : "pill-off"}`}>
          <span className="dot" />
          {on ? "Bật" : "Tắt"}
        </span>
      );
    },
  },
];

function resolveTab(raw: string | null): string {
  if (raw && TABS.some((t) => t.key === raw)) return raw;
  return "overview";
}

/* Content --------------------------------------------------------------------- */
function ServerDetailContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id;

  const [tab, setTab] = useState<string>(() => resolveTab(searchParams.get("tab")));
  const [server, setServer] = useState<ServerData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [status, setStatus] = useState<"online" | "offline" | "checking">("checking");
  const [overview, setOverview] = useState<OverviewResp | null>(null);

  const [chatOpen, setChatOpen] = useState(() => searchParams.get("tab") === "chat");
  const [editOpen, setEditOpen] = useState(() => searchParams.get("tab") === "settings");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Sync tab/chat/settings deep-links when the query changes.
  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "chat") setChatOpen(true);
    else if (raw === "settings") setEditOpen(true);
    else setTab(resolveTab(raw));
  }, [searchParams]);

  const loadServer = useCallback(() => {
    fetch(`/api/be/servers/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json() as Promise<ServerData>;
      })
      .then(setServer)
      .catch(() => setNotFound(true));
  }, [id]);

  const loadStatus = useCallback(() => {
    setStatus("checking");
    fetch(`/api/be/servers/${id}/overview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OverviewResp | null) => {
        setOverview(d);
        const offline = !d || Boolean(d.error) || d.source === null;
        setStatus(offline ? "offline" : "online");
      })
      .catch(() => setStatus("offline"));
  }, [id]);

  useEffect(() => {
    loadServer();
    loadStatus();
  }, [loadServer, loadStatus]);

  function refreshAll() {
    loadServer();
    loadStatus();
  }

  async function saveEdit(payload: ServerPayload) {
    setSaving(true);
    setSaveErr("");
    try {
      const res = await fetch(`/api/be/servers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { detail?: string };
        setSaveErr(d.detail || "Không thể lưu thay đổi.");
        return;
      }
      setEditOpen(false);
      refreshAll();
    } catch {
      setSaveErr("Lỗi kết nối.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Xóa máy chủ này? Hành động không thể hoàn tác.")) return;
    try {
      const res = await fetch(`/api/be/servers/${id}`, { method: "DELETE" });
      if (res.ok) router.push("/");
      else alert("Không thể xóa máy chủ.");
    } catch {
      alert("Lỗi kết nối khi xóa.");
    }
  }

  // aaPanel-only tabs are hidden when the API integration is off.
  const aapanelOn = server?.aapanel?.enabled !== false; // default-show until server loads
  const visibleTabs = aapanelOn ? TABS : TABS.filter((t) => !AAPANEL_ONLY_TABS.includes(t.key));

  // Deep-link guard: if the active tab isn't visible (e.g. ?tab=sites while
  // aaPanel is off), fall back to Overview instead of rendering a dead tab.
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : "overview";

  // Platform badge from the fetched overview (extensible shared helper).
  const badge = platformBadge(overview?.platform ?? null);

  const ip = server?.ssh?.host || server?.aapanel?.base_url || "";
  const os = overview?.system?.os || "";
  const uptime = overview?.system?.uptime || "";
  const metaParts = [ip, os, uptime ? `Uptime: ${uptime}` : ""].filter(Boolean);

  if (notFound) {
    return (
      <>
        <Link
          href="/"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
        >
          ← Servers
        </Link>
        <div className="card mt-6 p-8 text-center text-sm text-[var(--color-muted)]">
          Máy chủ không tồn tại hoặc bạn không có quyền truy cập.
        </div>
      </>
    );
  }

  return (
    <>
      {/* Breadcrumb */}
      <Link
        href="/"
        className="text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
      >
        Servers
      </Link>
      <span className="text-sm text-[var(--color-faint)]"> / {server?.name ?? "…"}</span>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <IconServer className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {server?.name ?? "Đang tải…"}
              </h1>
              <StatusPill status={status} />
              {overview?.platform !== undefined && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
              )}
            </div>
            {metaParts.length > 0 && (
              <p className="mt-0.5 truncate text-sm text-[var(--color-faint)] font-[family-name:var(--font-mono)]">
                {metaParts.join(" • ")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-none items-center gap-2">
          <button className="btn btn-primary py-1.5 text-sm" onClick={() => setChatOpen(true)}>
            <IconChat className="h-4 w-4" /> Chat AI
          </button>
          <button className="btn btn-ghost py-1.5 text-sm" onClick={refreshAll}>
            <IconRefresh className="h-4 w-4" /> Refresh
          </button>
          <KebabMenu onEdit={() => setEditOpen(true)} onDelete={remove} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5">
        <Tabs tabs={visibleTabs} active={activeTab} onChange={setTab} />
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "overview" && <OverviewTab serverId={id} />}
        {activeTab === "disk" && <DiskTab serverId={id} />}
        {activeTab === "services" && <ServicesTab serverId={id} />}
        {activeTab === "sites" && (
          <AaPanelTab
            serverId={id}
            endpoint="sites"
            title="Websites"
            columns={SITE_COLS}
            emptyText="Chưa có website nào."
          />
        )}
        {activeTab === "databases" && <DatabasesTab serverId={id} />}
        {activeTab === "cron" && (
          <AaPanelTab
            serverId={id}
            endpoint="cron"
            title="Cron jobs"
            columns={CRON_COLS}
            emptyText="Chưa có tác vụ cron nào."
          />
        )}
      </div>

      {/* Edit modal */}
      {editOpen && server && (
        <Modal
          title="Sửa server"
          onClose={() => !saving && setEditOpen(false)}
          locked={saving}
          size="xl"
        >
          {saveErr && (
            <div className="mb-4 rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {saveErr}
            </div>
          )}
          <ServerForm
            existing={{ ...server, id }}
            submitLabel="Lưu server"
            onSubmit={saveEdit}
            onCancel={() => setEditOpen(false)}
            busy={saving}
          />
        </Modal>
      )}

      {/* Chat slide-over */}
      {chatOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setChatOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-2xl flex-col border-l border-[var(--color-border)] bg-[var(--color-bg)] p-5 shadow-2xl"
            style={{ animation: "slideIn 0.28s ease both" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <IconChat className="h-5 w-5 text-[var(--color-accent)]" />
                Chat AI · {server?.name}
              </h2>
              <button
                className="text-[var(--color-faint)] hover:text-[var(--color-fg)] transition-colors"
                onClick={() => setChatOpen(false)}
                aria-label="Đóng"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPanel serverId={id} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ServerDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-muted)]">Đang tải…</p>}>
      <ServerDetailContent />
    </Suspense>
  );
}
