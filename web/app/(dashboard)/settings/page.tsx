"use client";

import { authClient } from "@/lib/auth-client";
import { IconEye, IconEyeOff } from "@/components/server/icons";
import {
  PageHeader,
  RolePill,
  Toast,
  Toggle,
  useToast,
} from "@/components/admin/shared";
import { useEffect, useState } from "react";

/* Types -------------------------------------------------------------------- */
interface Me {
  authenticated: boolean;
  user?: { id: string; email: string; name: string; role: string };
}
interface LlmCfg {
  provider: string;
  base_url?: string;
  model: string;
  temperature: number;
  api_key_set?: boolean;
}
interface NotifyCfg {
  email_enabled: boolean;
  email_to: string;
  telegram_enabled: boolean;
  telegram_chat_id: string;
  webhook_enabled: boolean;
  webhook_url: string;
}
interface SettingsResp {
  llm: Partial<LlmCfg>;
  notify: Partial<NotifyCfg>;
}

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

const NOTIFY_DEFAULT: NotifyCfg = {
  email_enabled: false,
  email_to: "",
  telegram_enabled: false,
  telegram_chat_id: "",
  webhook_enabled: false,
  webhook_url: "",
};

/* AI assistant card (admin only) ------------------------------------------- */
function AiCard({ onSaved }: { onSaved: () => void }) {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.2);
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SettingsResp | null) => {
        const llm = d?.llm ?? {};
        if (llm.provider) setProvider(llm.provider);
        if (llm.model) setModel(llm.model);
        if (typeof llm.temperature === "number") setTemperature(llm.temperature);
        setKeySet(!!llm.api_key_set);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const llm: Record<string, unknown> = { provider, model, temperature };
      if (apiKey.trim()) llm.api_key = apiKey.trim();
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm }),
      });
      if (!res.ok) throw new Error("save");
      if (apiKey.trim()) setKeySet(true);
      setApiKey("");
      onSaved();
    } catch {
      onSaved(); // onSaved handles toast; emit error variant via window event not needed
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/be/test/llm", { method: "POST" });
      const d = await res.json().catch(() => ({ ok: false, detail: "Lỗi phản hồi." }));
      setTestResult({ ok: !!d.ok, detail: String(d.detail ?? "") });
    } catch {
      setTestResult({ ok: false, detail: "Lỗi kết nối." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card p-5 fade-up">
      <h2 className="text-sm font-semibold">Trợ lý AI</h2>
      <p className="mt-1 text-xs text-[var(--color-faint)]">
        API key dùng chung hệ thống (MVP).
      </p>

      {!loaded ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">Đang tải…</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">LLM Provider</label>
            <select
              className="input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Model</label>
            <input
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini / claude-3-5-sonnet"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label">
              Temperature <span className="text-[var(--color-accent)]">{temperature.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label">API Key</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keySet ? "Đã lưu — để trống nếu không đổi" : "sk-..."}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-faint)] hover:text-[var(--color-fg)]"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Ẩn key" : "Hiện key"}
              >
                {showKey ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {testResult && (
            <div
              className="sm:col-span-2 rounded-lg border px-3 py-2 text-sm"
              style={{
                color: testResult.ok ? "var(--color-accent)" : "var(--color-danger)",
                borderColor: testResult.ok ? "rgba(33,208,122,0.4)" : "#46211f",
                background: testResult.ok ? "var(--color-accent-soft)" : "var(--color-danger-soft)",
              }}
            >
              {testResult.ok ? "Kết nối OK: " : "Lỗi: "}
              {testResult.detail}
            </div>
          )}

          <div className="sm:col-span-2 flex justify-end gap-2.5">
            <button className="btn btn-ghost" onClick={test} disabled={testing}>
              {testing ? "Đang kiểm tra…" : "Test"}
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Notification row --------------------------------------------------------- */
function NotifyRow({
  label,
  enabled,
  onToggle,
  value,
  onValue,
  placeholder,
  onTest,
  type = "text",
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onValue: (v: string) => void;
  placeholder: string;
  onTest: () => Promise<{ ok: boolean; detail: string }>;
  type?: string;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  async function run() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await onTest());
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Toggle checked={enabled} onChange={onToggle} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={run} disabled={testing}>
          {testing ? "…" : "Test"}
        </button>
      </div>
      <input
        className="input mt-3"
        type={type}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        placeholder={placeholder}
        disabled={!enabled}
      />
      {result && (
        <p
          className="mt-2 text-xs"
          style={{ color: result.ok ? "var(--color-accent)" : "var(--color-danger)" }}
        >
          {result.ok ? "OK: " : "Lỗi: "}
          {result.detail}
        </p>
      )}
    </div>
  );
}

/* Notifications card (admin only) ------------------------------------------ */
function NotifyCard({ onSaved }: { onSaved: () => void }) {
  const [cfg, setCfg] = useState<NotifyCfg | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SettingsResp | null) =>
        setCfg({ ...NOTIFY_DEFAULT, ...(d?.notify ?? {}) })
      )
      .catch(() => setCfg({ ...NOTIFY_DEFAULT }));
  }, []);

  function set<K extends keyof NotifyCfg>(key: K, val: NotifyCfg[K]) {
    setCfg((c) => (c ? { ...c, [key]: val } : c));
  }

  async function testNotify(channel: string): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(`/api/be/test/notify/${channel}`, { method: "POST" });
      const d = await res.json().catch(() => ({ ok: false, detail: "Lỗi phản hồi." }));
      return { ok: !!d.ok, detail: String(d.detail ?? "") };
    } catch {
      return { ok: false, detail: "Lỗi kết nối." };
    }
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify: cfg }),
      });
      if (!res.ok) throw new Error("save");
      onSaved();
    } catch {
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 fade-up">
      <h2 className="text-sm font-semibold">Thông báo</h2>
      {!cfg ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">Đang tải…</p>
      ) : (
        <div className="mt-4 space-y-3">
          <NotifyRow
            label="Email"
            enabled={cfg.email_enabled}
            onToggle={(v) => set("email_enabled", v)}
            value={cfg.email_to}
            onValue={(v) => set("email_to", v)}
            placeholder="ban@congty.com"
            type="email"
            onTest={() => testNotify("email")}
          />
          <NotifyRow
            label="Telegram"
            enabled={cfg.telegram_enabled}
            onToggle={(v) => set("telegram_enabled", v)}
            value={cfg.telegram_chat_id}
            onValue={(v) => set("telegram_chat_id", v)}
            placeholder="@username hoặc chat_id"
            onTest={() => testNotify("telegram")}
          />
          <NotifyRow
            label="Webhook"
            enabled={cfg.webhook_enabled}
            onToggle={(v) => set("webhook_enabled", v)}
            value={cfg.webhook_url}
            onValue={(v) => set("webhook_url", v)}
            placeholder="https://hooks.example.com/..."
            type="url"
            onTest={() => testNotify("webhook")}
          />

          <div className="flex justify-end pt-1">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ChatOps (Telegram) card (admin only) ------------------------------------- */
function ChatOpsCard({ onSaved }: { onSaved: () => void }) {
  const [botToken, setBotToken] = useState("");
  const [botTokenSet, setBotTokenSet] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookSecretSet, setWebhookSecretSet] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setBotTokenSet(!!d.notify?.telegram_bot_token_set);
        setWebhookSecretSet(!!d.chatops?.telegram_webhook_secret_set);
        setPublicBaseUrl(d.chatops?.public_base_url ?? "");
      })
      .catch(() => {});
  }, []);

  function genSecret() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    setWebhookSecret(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
  }

  async function save() {
    setSaving(true);
    try {
      // Blank token/secret => backend keeps the existing value.
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notify: { telegram_bot_token: botToken },
          chatops: { telegram_webhook_secret: webhookSecret, public_base_url: publicBaseUrl.trim() },
        }),
      });
      if (res.ok) {
        if (botToken) setBotTokenSet(true);
        if (webhookSecret) setWebhookSecretSet(true);
        setBotToken("");
        setWebhookSecret("");
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 fade-up">
      <h2 className="text-sm font-semibold">ChatOps — Telegram</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Cho phép chat 2 chiều với AI qua bot Telegram. Bot token dùng chung cho cả cảnh báo.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="label">Bot token</label>
          <div className="relative">
            <input
              className="input pr-10"
              type={show ? "text" : "password"}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={botTokenSet ? "Đã đặt — để trống nếu giữ nguyên" : "123456:ABC-DEF…"}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-faint)] hover:text-[var(--color-fg)]"
              aria-label="Hiện/ẩn"
            >
              {show ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label">Webhook secret</label>
          <div className="flex gap-2">
            <input
              className="input"
              type={show ? "text" : "password"}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={webhookSecretSet ? "Đã đặt — để trống nếu giữ nguyên" : "chuỗi bí mật ngẫu nhiên"}
            />
            <button type="button" className="btn btn-ghost px-3 text-sm" onClick={genSecret}>Tạo</button>
          </div>
        </div>

        <div>
          <label className="label">Public base URL</label>
          <input
            className="input"
            type="url"
            value={publicBaseUrl}
            onChange={(e) => setPublicBaseUrl(e.target.value)}
            placeholder="https://chat.example.com"
          />
          <p className="mt-1 text-xs text-[var(--color-faint)]">
            Webhook: {publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, "")}/api/webhooks/telegram/…` : "…/api/webhooks/telegram/<secret>"}
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Change password modal ---------------------------------------------------- */
function PasswordModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (ok: boolean, msg: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      setErr("Mật khẩu mới tối thiểu 8 ký tự.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: false,
      });
      if (res?.error) {
        setErr(res.error.message || "Không thể đổi mật khẩu.");
        return;
      }
      onDone(true, "Đã đổi mật khẩu thành công.");
      onClose();
    } catch {
      setErr("Không thể đổi mật khẩu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <form
        className="card w-full max-w-md p-6 fade-up"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-lg font-semibold">Đổi mật khẩu</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Mật khẩu hiện tại</label>
            <input
              className="input"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Mật khẩu mới</label>
            <input
              className="input"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </div>
          {err && (
            <p className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {err}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Đang đổi…" : "Đổi mật khẩu"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* Account card (all users) ------------------------------------------------- */
function AccountCard({
  me,
  onToast,
}: {
  me: Me | null;
  onToast: (m: string, k?: "success" | "error") => void;
}) {
  const [showModal, setShowModal] = useState(false);
  return (
    <div className="card p-5 fade-up">
      <h2 className="text-sm font-semibold">Tài khoản</h2>
      <div className="mt-4 space-y-3">
        <div>
          <label className="label">Email</label>
          <input className="input" value={me?.user?.email ?? ""} readOnly />
        </div>
        <div>
          <label className="label">Vai trò</label>
          <div>
            <RolePill role={me?.user?.role ?? "member"} />
          </div>
        </div>
        <div className="pt-1">
          <button className="btn btn-ghost" onClick={() => setShowModal(true)}>
            Đổi mật khẩu
          </button>
        </div>
      </div>

      {showModal && (
        <PasswordModal
          onClose={() => setShowModal(false)}
          onDone={(ok, msg) => onToast(msg, ok ? "success" : "error")}
        />
      )}
    </div>
  );
}

/* Page --------------------------------------------------------------------- */
export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [toast, showToast, clearToast] = useToast();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then(setMe)
      .catch(() => setMe({ authenticated: false }));
  }, []);

  const isAdmin = me?.user?.role === "admin";
  const onSaved = () => showToast("Đã lưu cài đặt thành công.");

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Cấu hình trợ lý AI, thông báo và tài khoản." />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {isAdmin && <AiCard onSaved={onSaved} />}
        {isAdmin && <NotifyCard onSaved={onSaved} />}
        {isAdmin && <ChatOpsCard onSaved={onSaved} />}
        <AccountCard me={me} onToast={showToast} />
        {me !== null && !isAdmin && (
          <div className="card p-5 text-sm text-[var(--color-muted)] fade-up">
            Cấu hình hệ thống (Trợ lý AI và Thông báo) chỉ dành cho quản trị viên.
          </div>
        )}
      </div>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
