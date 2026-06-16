"use client";

import { IconTrash } from "@/components/shell/icons";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface TgStatus {
  bot_configured: boolean;
  webhook_secret_set: boolean;
  public_base_url: string;
  webhook_url: string;
}
interface LinkRow {
  id: string;
  channel: string;
  serverId: string;
  serverName: string | null;
  linked: boolean;
  code: string | null;
}
interface ServerRow {
  id: string;
  name: string;
}

export default function ChatOpsPage() {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [serverId, setServerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [registerMsg, setRegisterMsg] = useState("");

  const reload = useCallback(() => {
    fetch("/api/be/chatops/status").then((r) => (r.ok ? r.json() : null)).then((d) => setStatus(d?.telegram ?? null)).catch(() => {});
    fetch("/api/be/chatops/links").then((r) => (r.ok ? r.json() : [])).then((d) => setLinks(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    fetch("/api/be/servers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ServerRow[]) => {
        const rows = (Array.isArray(d) ? d : []).map((s) => ({ id: String(s.id), name: s.name }));
        setServers(rows);
        setServerId(rows[0]?.id ?? "");
      })
      .catch(() => {});
  }, [reload]);

  async function createLink() {
    if (!serverId || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/be/chatops/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverId }),
      });
      if (res.ok) reload();
    } finally {
      setCreating(false);
    }
  }

  async function removeLink(id: string) {
    if (!confirm("Xóa liên kết này?")) return;
    await fetch(`/api/be/chatops/links/${id}`, { method: "DELETE" }).catch(() => {});
    reload();
  }

  async function registerWebhook() {
    setRegisterMsg("Đang đăng ký…");
    const res = await fetch("/api/be/chatops/telegram/register", { method: "POST" }).then((r) => r.json()).catch(() => ({ ok: false, detail: "Lỗi kết nối." }));
    setRegisterMsg(res.ok ? `✓ ${res.detail || "Đã đăng ký webhook."}` : `✗ ${res.detail || "Thất bại."}`);
  }

  const botReady = status?.bot_configured && status?.webhook_secret_set;

  return (
    <div className="h-full overflow-y-auto pr-1">
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Liên kết kênh nhắn tin để chat với trợ lý AI từ chính nền tảng đó. Tin nhắn sẽ được định tuyến tới agent theo server đã liên kết.
      </p>

      {/* Telegram (real) */}
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--color-accent-soft)] text-sm font-bold uppercase text-[var(--color-accent)]">TG</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Telegram</h3>
              <span className={`pill ${botReady ? "pill-on" : "pill-down"}`}>
                <span className="dot" /> {botReady ? "Sẵn sàng" : "Chưa cấu hình"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">Chat 2 chiều với AI qua bot Telegram.</p>
          </div>
        </div>

        {/* Setup status */}
        {!botReady && (
          <div className="mt-4 rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2.5 text-xs text-[var(--color-danger)]">
            Chưa cấu hình. Vào{" "}
            <Link href="/settings" className="font-semibold underline">Cài đặt → ChatOps</Link>{" "}
            (admin) để nhập Bot token, Webhook secret và Public base URL.
          </div>
        )}

        {status?.webhook_url && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium text-[var(--color-muted)]">Webhook URL (đăng ký với Telegram)</div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--color-border)] bg-[#0e1412] px-2.5 py-1.5 text-xs text-[var(--color-fg)]">{status.webhook_url}</code>
              <button onClick={registerWebhook} className="btn btn-ghost text-sm">Đăng ký tự động</button>
            </div>
            {registerMsg && <div className="mt-1.5 text-xs text-[var(--color-muted)]">{registerMsg}</div>}
          </div>
        )}

        {/* Create link */}
        <div className="mt-5 border-t border-[var(--color-border-soft)] pt-4">
          <div className="text-sm font-semibold">Liên kết một server</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className="input max-w-[240px]" value={serverId} onChange={(e) => setServerId(e.target.value)} aria-label="Chọn server">
              {servers.length === 0 && <option value="">Chưa có server</option>}
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button onClick={createLink} disabled={!serverId || creating} className="btn btn-primary text-sm disabled:opacity-50">
              {creating ? "Đang tạo…" : "Tạo mã liên kết"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Sau khi tạo mã, mở bot Telegram và gửi <span className="font-[family-name:var(--font-mono)] text-[var(--color-fg)]">/link &lt;mã&gt;</span> để hoàn tất.
          </p>
        </div>

        {/* Links list */}
        {links.length > 0 && (
          <div className="mt-4 space-y-2">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[#0e1412] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{l.serverName || l.serverId}</div>
                  {l.linked ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)]"><span className="dot" /> Đã liên kết</span>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">
                      Gửi tới bot: <span className="rounded bg-[var(--color-panel-2)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[var(--color-warn)]">/link {l.code}</span>
                    </span>
                  )}
                </div>
                <button onClick={() => removeLink(l.id)} className="grid h-8 w-8 flex-none place-items-center rounded-md text-[var(--color-faint)] transition-colors hover:text-[var(--color-danger)]" aria-label="Xóa liên kết">
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Planned channels */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          { name: "Discord", note: "Cần bot + webhook handler ở backend. Chưa hỗ trợ." },
          { name: "Zalo OA", note: "Cần Zalo OA + webhook handler ở backend. Chưa hỗ trợ." },
        ].map((c) => (
          <div key={c.name} className="card flex items-center gap-3 p-4 opacity-80">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--color-panel-2)] text-sm font-bold uppercase text-[var(--color-faint)]">{c.name.slice(0, 2)}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{c.name}</h3>
                <span className="pill">Sắp có</span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--color-faint)]">{c.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
