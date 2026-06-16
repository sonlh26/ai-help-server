"use client";

import { useEffect, useState } from "react";
import { IconEye, IconEyeOff, IconShield } from "@/components/server/icons";
import { Toggle } from "@/components/admin/shared";

/* Shapes ------------------------------------------------------------------- */
export interface ServerData {
  id?: string;
  name: string;
  note?: string;
  connection_type?: "ssh" | "agent";
  ssh: {
    enabled: boolean;
    host?: string;
    port?: number;
    username?: string;
    has_password?: boolean;
    has_private_key?: boolean;
  };
  aapanel: {
    enabled: boolean;
    base_url?: string;
    verify_ssl?: boolean;
    has_api_key?: boolean;
  };
  monitor: {
    enabled: boolean;
    interval_seconds?: number;
    services?: string[];
  };
}

/** Body shape the API accepts on POST/PUT (secrets only when changed). */
export interface ServerPayload {
  name: string;
  note: string;
  connection_type: "ssh" | "agent";
  ssh: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    password?: string;
    private_key?: string;
    key_passphrase?: string;
  };
  aapanel: {
    enabled: boolean;
    base_url: string;
    api_key?: string;
    verify_ssl: boolean;
  };
  monitor: {
    enabled: boolean;
    interval_seconds: number;
    services: string[];
  };
}

type AuthMode = "password" | "key";
type TestStatus = "idle" | "testing" | "ok" | "fail";
interface TestState {
  status: TestStatus;
  detail?: string;
}

interface FormState {
  name: string;
  note: string;
  connectionType: "ssh" | "agent";
  host: string;
  authMode: AuthMode;
  port: string;
  username: string;
  password: string;
  privateKey: string;
  passphrase: string;
  // Explicit "Dùng aaPanel API?" toggle — only aaPanel has an API integration.
  aapanelEnabled: boolean;
  baseUrl: string;
  apiKey: string;
  // Monitoring config — surfaced as section 4 in the form.
  monEnabled: boolean;
  interval: number;
  services: string[];
}

function toState(s?: ServerData): FormState {
  // In edit mode, default the auth mode to whatever secret is already stored.
  const authMode: AuthMode = s?.ssh.has_private_key && !s?.ssh.has_password ? "key" : "password";
  return {
    name: s?.name ?? "",
    note: s?.note ?? "",
    connectionType: s?.connection_type ?? "ssh",
    host: s?.ssh.host ?? "",
    authMode,
    port: String(s?.ssh.port ?? 22),
    username: s?.ssh.username ?? "root",
    password: "",
    privateKey: "",
    passphrase: "",
    // Default OFF for create; in edit mode reflect the stored flag.
    aapanelEnabled: s?.aapanel.enabled ?? false,
    baseUrl: s?.aapanel.base_url ?? "",
    apiKey: "",
    monEnabled: s?.monitor.enabled ?? false,
    interval: s?.monitor.interval_seconds ?? 60,
    services: s?.monitor.services ?? [],
  };
}

function buildPayload(f: FormState): ServerPayload {
  const host = f.host.trim();
  const baseUrl = f.baseUrl.trim();
  const payload: ServerPayload = {
    name: f.name.trim(),
    note: f.note.trim(),
    connection_type: f.connectionType,
    ssh: {
      // No visible enabled checkbox — derive from host (mockup has none).
      enabled: !!host,
      host,
      port: parseInt(f.port, 10) || 22,
      username: f.username.trim(),
    },
    aapanel: {
      // Driven by the explicit toggle — no longer derived from `!!base_url`.
      enabled: f.aapanelEnabled,
      base_url: baseUrl,
      verify_ssl: false,
    },
    monitor: {
      enabled: f.monEnabled,
      // Clamp to the documented minimum so a stray sub-15 value never ships.
      interval_seconds: Math.max(15, f.interval || 60),
      // Normalize on submit: trim each line, drop empties.
      services: f.services.map((s) => s.trim()).filter(Boolean),
    },
  };
  // Secrets: send only when the user typed something, and only for the active mode.
  if (f.authMode === "password") {
    if (f.password) payload.ssh.password = f.password;
  } else {
    if (f.privateKey) payload.ssh.private_key = f.privateKey;
    if (f.passphrase) payload.ssh.key_passphrase = f.passphrase;
  }
  if (f.apiKey) payload.aapanel.api_key = f.apiKey;
  return payload;
}

/* Local Agent enrollment: install command + online status (edit mode only) -- */
function AgentEnroll({ serverId }: { serverId?: string }) {
  const [data, setData] = useState<{ ok?: boolean; install?: string; detail?: string } | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!serverId) return;
    fetch(`/api/be/servers/${serverId}/agent/status`)
      .then((r) => r.json())
      .then((d) => setOnline(!!d?.online))
      .catch(() => setOnline(null));
  }, [serverId]);

  if (!serverId) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Lưu server trước, rồi mở lại để lấy lệnh cài agent.
      </p>
    );
  }

  async function issue() {
    setBusy(true);
    try {
      const d = await fetch(`/api/be/servers/${serverId}/agent/token`, { method: "POST" }).then((r) => r.json());
      setData(d);
    } catch {
      setData({ ok: false, detail: "Lỗi kết nối." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`dot ${online ? "text-[var(--color-accent)]" : "text-[var(--color-faint)]"}`} />
        <span className={online ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"}>
          {online === null ? "Đang kiểm tra…" : online ? "Agent đang online" : "Agent chưa kết nối"}
        </span>
      </div>

      <button type="button" className="btn btn-ghost text-sm" onClick={issue} disabled={busy}>
        {busy ? "Đang tạo…" : "Lấy lệnh cài agent"}
      </button>

      {data && data.ok === false && (
        <p className="text-xs text-[var(--color-danger)]">{data.detail}</p>
      )}
      {data?.install && (
        <div>
          <div className="mb-1 text-xs font-medium text-[var(--color-muted)]">Chạy trên server (sau khi build agent):</div>
          <pre className="overflow-x-auto rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412] px-3 py-2 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap break-words">
            {data.install}
          </pre>
          <p className="mt-1.5 text-xs text-[var(--color-faint)]">
            Token gắn riêng server này. Creds không rời máy bạn — agent chỉ chạy các hàm đã khai báo.
          </p>
        </div>
      )}
    </div>
  );
}

/* Inline icons (only the ones missing from the shared icon set) ------------- */
type IconProps = { className?: string };
const ico = (className?: string) => ({
  className,
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

function IconKey({ className }: IconProps) {
  return (
    <svg {...ico(className)}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3M16 7l3 3M14 9l2 2" />
    </svg>
  );
}

function IconFile({ className }: IconProps) {
  return (
    <svg {...ico(className)}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

function IconWifi({ className }: IconProps) {
  return (
    <svg {...ico(className)}>
      <path d="M5 12.55a11 11 0 0 1 14 0M8.5 16.1a6 6 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0" />
      <path d="M12 20h.01" />
    </svg>
  );
}

function IconSave({ className }: IconProps) {
  return (
    <svg {...ico(className)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

/* Small building blocks ---------------------------------------------------- */

/** Green numbered badge + heading used to anchor each section. */
function SectionHead({
  num,
  title,
  hint,
}: {
  num: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-[#07140d]">
        {num}
      </span>
      <h3 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h3>
      {hint && <span className="text-xs text-[var(--color-faint)]">{hint}</span>}
    </div>
  );
}

/** Password-style input with an eye toggle for revealing the value. */
function SecretInput({
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className="input pr-10"
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-faint)] hover:text-[var(--color-fg)] transition-colors"
        aria-label={show ? "Ẩn" : "Hiện"}
        tabIndex={-1}
      >
        {show ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** Coerce a server error `detail` (string or {msg,detail,status} object) to readable text.
    aaPanel returns objects like {status:false, msg:"…"} which must not render as "[object Object]". */
function detailText(d: unknown): string {
  if (d == null) return "";
  if (typeof d === "string") return d;
  if (typeof d === "object") {
    const o = d as Record<string, unknown>;
    if (typeof o.msg === "string") return o.msg;
    if (typeof o.detail === "string") return o.detail;
    if (o.detail && typeof o.detail === "object" && typeof (o.detail as Record<string, unknown>).msg === "string") {
      return (o.detail as Record<string, string>).msg;
    }
    try {
      return JSON.stringify(d);
    } catch {
      return String(d);
    }
  }
  return String(d);
}

/** Inline test status: colored dot + label, driven by {ok, detail}. */
function TestStatusText({ t }: { t: TestState }) {
  if (t.status === "idle")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-faint)]">
        <span className="dot" /> Chưa kiểm tra
      </span>
    );
  if (t.status === "testing")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-warn)]">
        <span className="dot pulse" /> Đang kiểm tra…
      </span>
    );
  if (t.status === "ok")
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)]"
        title={t.detail}
      >
        <span className="dot" /> Kết nối OK{t.detail ? ` — ${t.detail}` : ""}
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-[var(--color-danger)]"
      title={t.detail}
    >
      <span className="dot" /> Lỗi{t.detail ? `: ${t.detail}` : ""}
    </span>
  );
}

/**
 * Server create/edit form (modal body).
 * - `existing` present = edit mode: prefills non-secret fields, shows has_* hints.
 * - In-form "Test kết nối" buttons: edit mode → POST /servers/{id}/test/{target};
 *   create mode → POST /servers/test/{target} with the current (raw) body.
 * Layout follows the mockup: two columns (general / SSH) + full-width aaPanel
 * + encryption notice + footer. No monitor / enabled / verify-ssl UI.
 */
/* Curated systemd services to monitor — web & database first (most critical for
   keeping sites/apps up), then common extras. Users can still add custom names. */
const SERVICE_GROUPS: { label: string; items: string[] }[] = [
  { label: "Web server", items: ["nginx", "apache2", "openlitespeed", "php-fpm"] },
  { label: "Database", items: ["mysql", "mariadb", "postgresql", "redis", "mongod"] },
  { label: "Khác", items: ["docker", "pure-ftpd", "sshd", "postfix"] },
];

export default function ServerForm({
  existing,
  submitLabel = "Lưu server",
  onSubmit,
  onCancel,
  busy,
}: {
  existing?: ServerData;
  submitLabel?: string;
  onSubmit: (payload: ServerPayload) => void | Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
}) {
  const [f, setF] = useState<FormState>(() => toState(existing));
  const [sshTest, setSshTest] = useState<TestState>({ status: "idle" });
  const [aaTest, setAaTest] = useState<TestState>({ status: "idle" });
  const [customSvc, setCustomSvc] = useState("");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  // Currently-selected services (normalized).
  const selectedSvcs = f.services.map((s) => s.trim()).filter(Boolean);
  const toggleSvc = (name: string) =>
    set(
      "services",
      selectedSvcs.includes(name) ? selectedSvcs.filter((s) => s !== name) : [...selectedSvcs, name],
    );
  const addCustomSvc = () => {
    const v = customSvc.trim();
    if (v && !selectedSvcs.includes(v)) set("services", [...selectedSvcs, v]);
    setCustomSvc("");
  };
  // Selected services that aren't in the curated suggestions (custom entries).
  const extraSvcs = selectedSvcs.filter((s) => !SERVICE_GROUPS.some((g) => g.items.includes(s)));

  const isEdit = !!existing;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(buildPayload(f));
  }

  /** Run a connection test for SSH or aaPanel against the live backend. */
  async function runTest(target: "ssh" | "aapanel") {
    const setT = target === "ssh" ? setSshTest : setAaTest;
    setT({ status: "testing" });
    try {
      const url = isEdit
        ? `/api/be/servers/${existing!.id}/test/${target}`
        : `/api/be/servers/test/${target}`;
      const init: RequestInit = isEdit
        ? { method: "POST" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayload(f)),
          };
      const res = await fetch(url, init);
      const r = (await res.json().catch(() => ({ ok: false, detail: "Lỗi phản hồi." }))) as {
        ok?: boolean;
        detail?: unknown;
      };
      setT({ status: r.ok ? "ok" : "fail", detail: detailText(r.detail) });
    } catch {
      setT({ status: "fail", detail: "Lỗi kết nối." });
    }
  }

  const secretPlaceholder = (stored?: boolean, fallback?: string) =>
    isEdit && stored ? "Đã lưu — để trống nếu không đổi" : fallback;

  // Validation — always require SSH usable: name + host + (typed secret OR,
  // in edit mode, a secret already saved). If aaPanel ON, additionally require
  // base_url + (typed api_key OR, in edit, a saved api_key).
  const hasSecret = f.authMode === "password" ? !!f.password : !!f.privateKey;
  const storedSecret =
    f.authMode === "password" ? existing?.ssh.has_password : existing?.ssh.has_private_key;
  const isAgent = f.connectionType === "agent";
  // Agent-mode needs only a name (no SSH creds). SSH-mode needs host + a secret.
  const sshOk = isAgent
    ? !!f.name.trim()
    : !!f.name.trim() && !!f.host.trim() && (hasSecret || (isEdit && !!storedSecret));
  const aapanelOk =
    isAgent ||
    !f.aapanelEnabled ||
    (!!f.baseUrl.trim() && (!!f.apiKey || (isEdit && !!existing?.aapanel.has_api_key)));
  const canSubmit = sshOk && aapanelOk;

  // Inline message explaining why submit is blocked (first failing rule).
  const blockMsg = !sshOk
    ? isAgent
      ? "Cần nhập tên server."
      : "Cần Host/IP và mật khẩu hoặc private key để kết nối SSH."
    : !aapanelOk
      ? "Đã bật aaPanel API — cần nhập API URL và API Key."
      : "";

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Connection method ------------------------------------------------- */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--color-fg)]">Cách kết nối</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([
            ["ssh", "SSH (lưu credentials)", "Server quản lý qua SSH — bạn cung cấp host + key/password."],
            ["agent", "Local Agent (không lưu creds)", "Cài agent mã nguồn mở trên server; creds không rời máy bạn."],
          ] as [FormState["connectionType"], string, string][]).map(([val, title, desc]) => {
            const active = f.connectionType === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => set("connectionType", val)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  active ? "border-[rgba(33,208,122,0.5)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] hover:border-[#2f3f37]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`grid h-4 w-4 place-items-center rounded-full border ${active ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>
                    {active && <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />}
                  </span>
                  <span className="text-sm font-medium">{title}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-[var(--color-muted)]">{desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Local Agent enrollment (agent connection) ------------------------- */}
      {f.connectionType === "agent" && (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <IconShield className="h-5 w-5 text-[var(--color-accent)]" />
            <h3 className="text-sm font-semibold text-[var(--color-fg)]">Local Agent</h3>
            <span className="text-xs text-[var(--color-faint)]">(cài trên server)</span>
          </div>
          <AgentEnroll serverId={existing?.id} />
        </section>
      )}

      {/* Two-column grid: general (left) + SSH credentials (right) ---------- */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* LEFT — General -------------------------------------------------- */}
        <section className="space-y-4">
          <SectionHead num={1} title="Thông tin chung" />

          <div>
            <label className="label">
              Tên server <span className="text-[var(--color-danger)]">*</span>
            </label>
            <input
              className="input"
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ví dụ: Web Production"
              required
            />
          </div>

          <div>
            <label className="label">
              Host / IP {!isAgent && <span className="text-[var(--color-danger)]">*</span>}
            </label>
            <input
              className="input"
              value={f.host}
              onChange={(e) => set("host", e.target.value)}
              placeholder={isAgent ? "Tuỳ chọn (agent không cần)" : "Ví dụ: 203.0.113.10 hoặc example.com"}
              required={!isAgent}
            />
          </div>

          <div>
            <label className="label">Ghi chú</label>
            <textarea
              className="input"
              rows={3}
              value={f.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="Ghi chú thêm về server (tùy chọn)"
            />
          </div>
        </section>

        {/* RIGHT — SSH credentials (only for SSH connection) -------------- */}
        {f.connectionType === "ssh" && (
        <section className="space-y-4">
          <SectionHead num={2} title="SSH credentials" />

          {/* Auth mode segmented toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--color-border)] bg-[#0a0d0c] p-1">
            {(["password", "key"] as AuthMode[]).map((mode) => {
              const active = f.authMode === mode;
              const Icon = mode === "password" ? IconKey : IconFile;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set("authMode", mode)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-[var(--color-accent)] text-[#07140d]"
                      : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {mode === "password" ? "Password" : "Private key"}
                </button>
              );
            })}
          </div>

          {/* Port + Username */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">
                Port <span className="text-[var(--color-danger)]">*</span>
              </label>
              <input
                className="input"
                type="number"
                value={f.port}
                onChange={(e) => set("port", e.target.value)}
                placeholder="22"
                min={1}
                max={65535}
                required
              />
            </div>
            <div>
              <label className="label">
                Username <span className="text-[var(--color-danger)]">*</span>
              </label>
              <input
                className="input"
                value={f.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder="root"
                required
              />
            </div>
          </div>

          {/* Secret: password OR private key + passphrase */}
          {f.authMode === "password" ? (
            <div>
              <label className="label">
                Password <span className="text-[var(--color-danger)]">*</span>
              </label>
              <SecretInput
                value={f.password}
                onChange={(v) => set("password", v)}
                placeholder={secretPlaceholder(existing?.ssh.has_password, "••••••••")}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="label">
                  Private key <span className="text-[var(--color-danger)]">*</span>
                </label>
                <textarea
                  className="input font-[family-name:var(--font-mono)] text-xs"
                  rows={4}
                  value={f.privateKey}
                  onChange={(e) => set("privateKey", e.target.value)}
                  placeholder={
                    secretPlaceholder(
                      existing?.ssh.has_private_key,
                      "-----BEGIN OPENSSH PRIVATE KEY-----",
                    )
                  }
                />
              </div>
              <div>
                <label className="label">Passphrase</label>
                <SecretInput
                  value={f.passphrase}
                  onChange={(v) => set("passphrase", v)}
                  placeholder="Để trống nếu khóa không có passphrase"
                />
              </div>
            </div>
          )}

          {/* Test SSH */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              className="btn btn-ghost py-1.5 text-sm"
              onClick={() => runTest("ssh")}
              disabled={sshTest.status === "testing" || busy}
            >
              <IconWifi className="h-4 w-4" />
              Test kết nối SSH
            </button>
            <TestStatusText t={sshTest} />
          </div>
        </section>
        )}
      </div>

      {/* FULL-WIDTH — aaPanel API (only for SSH connection) --------------- */}
      {f.connectionType === "ssh" && (
      <section className="space-y-4">
        <SectionHead num={3} title="aaPanel API" hint="(tùy chọn)" />

        {/* Explicit opt-in toggle. OFF = SSH-only management. */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-[var(--color-fg)]">Dùng aaPanel API?</span>
            <p className="mt-0.5 text-xs text-[var(--color-faint)]">
              Bật để quản lý Sites / Databases / Cron qua aaPanel. Tắt = chỉ giám sát qua SSH.
            </p>
          </div>
          <Toggle
            checked={f.aapanelEnabled}
            onChange={(v) => {
              set("aapanelEnabled", v);
              // Reset the test indicator when turning the integration off.
              if (!v) setAaTest({ status: "idle" });
            }}
          />
        </div>

        {f.aapanelEnabled && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">
                  API URL <span className="text-[var(--color-danger)]">*</span>
                </label>
                <input
                  className="input"
                  value={f.baseUrl}
                  onChange={(e) => set("baseUrl", e.target.value)}
                  placeholder="Ví dụ: http://203.0.113.10:7800"
                />
              </div>
              <div>
                <label className="label">
                  API Key{" "}
                  {!(isEdit && existing?.aapanel.has_api_key) && (
                    <span className="text-[var(--color-danger)]">*</span>
                  )}
                </label>
                <SecretInput
                  value={f.apiKey}
                  onChange={(v) => set("apiKey", v)}
                  placeholder={secretPlaceholder(existing?.aapanel.has_api_key, "Nhập API key")}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                className="btn btn-ghost py-1.5 text-sm"
                onClick={() => runTest("aapanel")}
                disabled={aaTest.status === "testing" || busy}
              >
                <IconWifi className="h-4 w-4" />
                Test kết nối aaPanel
              </button>
              <TestStatusText t={aaTest} />
            </div>
          </>
        )}
      </section>
      )}

      {/* FULL-WIDTH — Monitoring ------------------------------------------- */}
      <section className="space-y-4">
        <SectionHead num={4} title="Giám sát" hint="(cảnh báo khi dịch vụ down)" />

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--color-fg)]">Bật giám sát dịch vụ</span>
          <Toggle checked={f.monEnabled} onChange={(v) => set("monEnabled", v)} />
        </div>

        <div className="max-w-xs">
          <label className="label">Chu kỳ kiểm tra (giây)</label>
          <input
            className="input"
            type="number"
            value={f.interval}
            onChange={(e) => set("interval", parseInt(e.target.value, 10) || 0)}
            onBlur={(e) => {
              // Clamp to the documented minimum on blur for clear feedback.
              const n = parseInt(e.target.value, 10);
              set("interval", Number.isFinite(n) && n >= 15 ? n : 15);
            }}
            placeholder="60"
            min={15}
            disabled={!f.monEnabled}
          />
        </div>

        <div>
          <label className="label">Dịch vụ cần giám sát</label>
          <p className="mb-2.5 text-xs text-[var(--color-faint)]">
            Chọn dịch vụ web/database để cảnh báo khi sập. Bấm để bật/tắt.
          </p>

          <div className={`space-y-3 ${f.monEnabled ? "" : "pointer-events-none opacity-50"}`}>
            {SERVICE_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 text-xs font-medium text-[var(--color-muted)]">{g.label}</div>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((name) => {
                    const on = selectedSvcs.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleSvc(name)}
                        disabled={!f.monEnabled}
                        className={`rounded-md border px-2.5 py-1 font-[family-name:var(--font-mono)] text-xs transition-colors ${
                          on
                            ? "border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                            : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Custom services not in the curated list */}
            {extraSvcs.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-[var(--color-muted)]">Tùy chỉnh</div>
                <div className="flex flex-wrap gap-2">
                  {extraSvcs.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleSvc(name)}
                      disabled={!f.monEnabled}
                      className="rounded-md border border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]"
                    >
                      ✕ {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add a custom service name */}
            <div className="flex max-w-md gap-2">
              <input
                className="input font-[family-name:var(--font-mono)] text-xs"
                value={customSvc}
                onChange={(e) => setCustomSvc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSvc();
                  }
                }}
                placeholder="vd: php8.2-fpm, redis-server…"
                disabled={!f.monEnabled}
              />
              <button type="button" className="btn btn-ghost px-3 text-sm" onClick={addCustomSvc} disabled={!f.monEnabled}>
                Thêm
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Encryption notice -------------------------------------------------- */}
      <div className="flex items-start gap-3 rounded-xl border border-[rgba(33,208,122,0.25)] bg-[var(--color-accent-soft)] px-4 py-3">
        <IconShield className="mt-0.5 h-5 w-5 flex-none text-[var(--color-accent)]" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-[var(--color-accent)]">
            Thông tin được mã hóa envelope (AES-256-GCM)
          </p>
          <p className="mt-0.5 text-[var(--color-muted)]">
            Tất cả thông tin nhạy cảm được mã hóa trước khi lưu trữ.
          </p>
        </div>
      </div>

      {/* Inline validation hint (only when submit is blocked) -------------- */}
      {!canSubmit && blockMsg && (
        <p className="text-xs text-[var(--color-danger)]">{blockMsg}</p>
      )}

      {/* Footer ------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Hủy
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !canSubmit}>
          <IconSave className="h-4 w-4" />
          {busy ? "Đang lưu…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
