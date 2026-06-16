"use client";

import ApprovalsButton from "@/components/chat/ApprovalsButton";
import Markdown from "@/components/chat/Markdown";
import { IconChevron, IconPlus, IconTrash } from "@/components/shell/icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/* ===========================================================================
   Standalone AI Chat page (top-level, not per-server).

   - A server selector picks the context; the chat streams real SSE events from
     POST /api/be/servers/{id}/chat.
   - Conversations are PERSISTED per user via /api/conversations (saved after
     every completed turn) so history survives reloads.
   - analyze_disk_usage results render as donut / top-dir bars / reclaimable /
     cleanup table, plus a confirmation card whose buttons drive real follow-up
     agent turns.
=========================================================================== */

interface Skill {
  key: string;
  name: string;
  category: string;
  prompt: string;
}
interface ServerRow {
  id: string;
  name: string;
  host: string;
}
interface ConvMeta {
  id: string;
  title: string;
  serverId: string | null;
  updatedAt: string;
}

const SKILL_LABELS: Record<string, string> = {
  ssl: "SSL",
  database: "DB",
  website: "Website",
  log: "Log",
  service: "Service",
  performance: "Performance",
  security: "Security",
  disk: "Disk",
  cron: "Cron",
};
const SKILL_ORDER = ["ssl", "database", "website", "log", "service", "performance", "security", "disk", "cron"];

const SUGGESTIONS = [
  "Vì sao đầy ổ đĩa?",
  "Kiểm tra sức khỏe server",
  "Xem tài nguyên đang dùng",
  "Dịch vụ nào đang down?",
  "Top file lớn nhất",
  "Dọn log cũ (> 7 ngày)",
  "Docker dọn dẹp",
  "SSL nào sắp hết hạn?",
  "Gợi ý tối ưu disk",
];

type ConfirmStatus = "pending" | "running" | "confirmed" | "cancelled";
type Part =
  | { kind: "text"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "tool_call"; name: string; args: unknown; running: boolean }
  | { kind: "tool_result"; name: string; result: string; durationMs?: number }
  | { kind: "confirm"; name: string; args: Record<string, unknown>; reason: string; rememberOk: boolean; status: ConfirmStatus };

interface Msg {
  role: "user" | "assistant";
  content: string;
  parts?: Part[];
  time: string;
  actionDone?: boolean;
}

interface DiskAnalysis {
  tool?: string;
  mode?: string;
  summary?: { total: string; used: string; used_percent: number };
  top_dirs?: { path: string; size: string; percent: number }[];
  reclaimable?: { total: string; total_bytes: number; items: { label: string; size: string }[] };
  cleanup_items?: { id: number; type: string; path: string; size: string; action: string; safe: boolean }[];
  note?: string;
}

/* Helpers ------------------------------------------------------------------ */
function hhmm(d: Date): string {
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
}
function newId(): string {
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
function deriveTitle(msgs: Msg[]): string {
  const firstUser = msgs.find((m) => m.role === "user");
  return (firstUser?.content || "Hội thoại mới").slice(0, 60);
}
function asDiskAnalysis(result: string): DiskAnalysis | null {
  try {
    const obj = JSON.parse(result) as DiskAnalysis;
    if (obj && obj.tool === "analyze_disk_usage" && obj.summary) return obj;
  } catch {
    /* not JSON */
  }
  return null;
}
function diskAction(parts?: Part[]): { total: string } | null {
  for (const p of parts ?? []) {
    if (p.kind === "tool_result") {
      const da = asDiskAnalysis(p.result);
      if (da?.reclaimable && da.reclaimable.total_bytes > 0) return { total: da.reclaimable.total };
    }
  }
  return null;
}

/* Inline icons ------------------------------------------------------------- */
function IconPaperclip({ className }: { className?: string }) {
  return (
    <svg className={className} width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49" />
    </svg>
  );
}
function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
    </svg>
  );
}
function IconBrain({ className }: { className?: string }) {
  return (
    <svg className={className} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
function IconSparkle({ className }: { className?: string }) {
  return (
    <svg className={className} width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm6 11l.9 2.6L21.5 16l-2.6.9L18 19.5l-.9-2.6L14.5 16l2.6-.9L18 13z" />
    </svg>
  );
}
function AiAvatar() {
  return (
    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--color-accent-soft)] text-xs font-bold text-[var(--color-accent)] ring-1 ring-[rgba(33,208,122,0.3)]">
      AI
    </span>
  );
}

/* Collapsible -------------------------------------------------------------- */
function Disclosure({ header, children, defaultOpen = false }: { header: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
        {header}
        <IconChevron className={`ml-auto h-3.5 w-3.5 flex-none text-[var(--color-faint)] transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="border-t border-[var(--color-border-soft)]">{children}</div>}
    </div>
  );
}

function sevColor(p: number): string {
  return p >= 30 ? "var(--color-danger)" : p >= 15 ? "var(--color-warn)" : "var(--color-accent)";
}

/* Rich disk-analysis result card ------------------------------------------- */
function DiskAnalysisCard({ da, durationMs }: { da: DiskAnalysis; durationMs?: number }) {
  const [raw, setRaw] = useState(false);
  const pct = da.summary?.used_percent ?? 0;
  const ring = pct >= 90 ? "var(--color-danger)" : pct >= 70 ? "var(--color-warn)" : "var(--color-accent)";
  return (
    <div className="rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412]">
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <span className="dot text-[var(--color-accent)]" />
        <span className="truncate font-[family-name:var(--font-mono)] text-[var(--color-fg)]">analyze_disk_usage</span>
        <span className="flex-none text-[var(--color-accent)]">✓ Completed</span>
        <span className="ml-auto flex flex-none items-center gap-3 text-[var(--color-faint)]">
          {durationMs != null && <span>Thời gian: {(durationMs / 1000).toFixed(2)}s</span>}
          <button onClick={() => setRaw((r) => !r)} className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]">
            {raw ? "Thu gọn" : "Mở rộng"}
          </button>
        </span>
      </div>
      <div className="border-t border-[var(--color-border-soft)] p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-[var(--color-border-soft)] p-3">
            <div className="mb-2 text-xs font-semibold text-[var(--color-accent)]">Tóm tắt kết quả (dry-run)</div>
            <div className="flex items-center gap-3">
              <div className="relative grid h-20 w-20 flex-none place-items-center rounded-full" style={{ background: `conic-gradient(${ring} ${pct * 3.6}deg, #1b2421 0deg)` }}>
                <div className="absolute inset-[8px] grid place-items-center rounded-full bg-[#0e1412]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-[var(--color-muted)]">Tổng dung lượng</div>
                <div className="text-xl font-semibold tabular-nums">{da.summary?.total}</div>
                <div className="text-xs font-medium tabular-nums" style={{ color: ring }}>
                  Đã dùng {da.summary?.used} ({pct}%)
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-border-soft)] p-3">
            <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">Top thư mục sử dụng nhiều dung lượng</div>
            <div className="space-y-1.5">
              {(da.top_dirs ?? []).map((d) => (
                <div key={d.path} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-[family-name:var(--font-mono)] text-[var(--color-fg)]">{d.path}</span>
                    <span className="flex-none tabular-nums text-[var(--color-muted)]">
                      {d.size} ({d.percent}%)
                    </span>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--color-border-soft)]">
                    <span className="block h-full rounded-full" style={{ width: `${Math.min(100, d.percent)}%`, background: sevColor(d.percent) }} />
                  </span>
                </div>
              ))}
              {(da.top_dirs ?? []).length === 0 && <div className="text-xs text-[var(--color-faint)]">Không có dữ liệu.</div>}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-border-soft)] p-3">
            <div className="mb-1 text-xs font-semibold text-[var(--color-muted)]">Có thể giải phóng (ước tính)</div>
            <div className="text-2xl font-semibold text-[var(--color-accent)] tabular-nums">{da.reclaimable?.total ?? "0"}</div>
            <div className="mt-2 text-xs text-[var(--color-muted)]">An toàn để dọn dẹp</div>
            <div className="mt-1.5 space-y-1.5">
              {(da.reclaimable?.items ?? []).map((it) => (
                <div key={it.label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="dot flex-none text-[var(--color-accent)]" />
                    <span className="truncate text-[var(--color-fg)]">{it.label}</span>
                  </span>
                  <span className="flex-none tabular-nums text-[var(--color-muted)]">{it.size}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {(da.cleanup_items ?? []).length > 0 && (
          <div className="mt-4">
            <Disclosure defaultOpen header={<span className="font-semibold text-[var(--color-muted)]">Chi tiết đề xuất dọn dẹp ({da.cleanup_items!.length} mục)</span>}>
              <div className="overflow-x-auto px-3 py-2.5">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="text-left text-[var(--color-muted)]">
                      <th className="pb-2 pr-3 font-medium">ID</th>
                      <th className="pb-2 pr-3 font-medium">Loại</th>
                      <th className="pb-2 pr-3 font-medium">Đường dẫn</th>
                      <th className="pb-2 pr-3 font-medium">Kích thước</th>
                      <th className="pb-2 pr-3 font-medium">Hành động đề xuất</th>
                      <th className="pb-2 font-medium">An toàn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {da.cleanup_items!.map((it) => (
                      <tr key={it.id} className="border-t border-[var(--color-border-soft)]">
                        <td className="py-1.5 pr-3 tabular-nums text-[var(--color-muted)]">{it.id}</td>
                        <td className="py-1.5 pr-3 text-[var(--color-fg)]">{it.type}</td>
                        <td className="py-1.5 pr-3 font-[family-name:var(--font-mono)] text-[var(--color-muted)]">{it.path}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-[var(--color-muted)]">{it.size}</td>
                        <td className="py-1.5 pr-3 text-[var(--color-muted)]">{it.action}</td>
                        <td className="py-1.5">{it.safe ? <span className="text-[var(--color-accent)]">An toàn</span> : <span className="text-[var(--color-warn)]">Cân nhắc</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Disclosure>
          </div>
        )}
        {raw && (
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border-soft)] bg-[#0b0f0e] p-3 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-muted)]">
            {stringify(da)}
          </pre>
        )}
      </div>
    </div>
  );
}

/* Render one assistant part ------------------------------------------------ */
/* Confirm card: Always / One-time / No for a risky tool call ---------------- */
function ConfirmCard({
  part,
  disabled,
  onPick,
}: {
  part: Extract<Part, { kind: "confirm" }>;
  disabled: boolean;
  onPick: (mode: "once" | "always" | "no") => void;
}) {
  return (
    <div className="rounded-xl border border-[rgba(240,180,41,0.35)] bg-[var(--color-warn-soft)] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-warn)]">⚠ Cần xác nhận</div>
      <div className="mt-1 text-sm text-[var(--color-fg)] font-[family-name:var(--font-mono)]">{part.name}</div>
      <div className="mt-0.5 text-xs text-[var(--color-muted)]">{part.reason}</div>
      {Object.keys(part.args).length > 0 && (
        <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--color-border-soft)] bg-[#0e1412] p-2 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)]">
          {stringify(part.args)}
        </pre>
      )}
      {part.status === "pending" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => onPick("once")} disabled={disabled} className="btn px-4 text-sm disabled:opacity-50" style={{ backgroundColor: "var(--color-warn)", color: "#1c1606" }}>
            Chỉ lần này
          </button>
          {part.rememberOk && (
            <button onClick={() => onPick("always")} disabled={disabled} className="btn btn-ghost px-4 text-sm disabled:opacity-50">
              Luôn cho phép
            </button>
          )}
          <button onClick={() => onPick("no")} disabled={disabled} className="btn btn-ghost px-4 text-sm disabled:opacity-50">
            Từ chối
          </button>
        </div>
      ) : (
        <div
          className="mt-2 text-xs font-medium"
          style={{ color: part.status === "cancelled" ? "var(--color-muted)" : "var(--color-accent)" }}
        >
          {part.status === "running" ? "Đang chạy…" : part.status === "confirmed" ? "✓ Đã thực hiện" : "Đã hủy"}
        </div>
      )}
    </div>
  );
}

function PartView({ part, streaming, isLastPart }: { part: Part; streaming: boolean; isLastPart: boolean }) {
  if (part.kind === "confirm") return null; // rendered by <ConfirmCard> in the message list
  if (part.kind === "text") {
    return (
      <div>
        <Markdown>{part.text}</Markdown>
        {streaming && isLastPart && <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-[var(--color-accent)] pulse align-middle" />}
      </div>
    );
  }
  if (part.kind === "thought") {
    const preview = part.text.replace(/\s+/g, " ").slice(0, 70);
    return (
      <Disclosure
        header={
          <span className="flex min-w-0 items-center gap-2 text-[var(--color-muted)]">
            <IconBrain className="h-3.5 w-3.5 flex-none text-[var(--color-warn)]" />
            <span className="font-semibold">Thinking (reasoning)</span>
            <span className="truncate text-[var(--color-faint)]">• {preview}…</span>
          </span>
        }
      >
        <p className="whitespace-pre-wrap px-3 py-2.5 text-xs leading-relaxed text-[var(--color-muted)]">{part.text}</p>
      </Disclosure>
    );
  }
  if (part.kind === "tool_call") {
    return (
      <div className="rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412]">
        <div className="flex items-center gap-2 px-3 py-2 text-xs">
          <span className="dot text-[var(--color-accent)]" />
          <span className="font-semibold text-[var(--color-muted)]">Tool call</span>
          <span className="truncate font-[family-name:var(--font-mono)] text-[var(--color-fg)]">{part.name}</span>
          {part.running && (
            <span className="ml-auto flex flex-none items-center gap-1.5 text-[var(--color-warn)]">
              <span className="dot pulse" /> Running…
            </span>
          )}
        </div>
        <div className="border-t border-[var(--color-border-soft)] px-3 py-2.5">
          <div className="mb-1 text-xs text-[var(--color-muted)]">Parameters</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-fg)]">{stringify(part.args)}</pre>
        </div>
      </div>
    );
  }
  const da = asDiskAnalysis(part.result);
  if (da) return <DiskAnalysisCard da={da} durationMs={part.durationMs} />;
  return (
    <div className="rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412]">
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <span className="dot text-[var(--color-accent)]" />
        <span className="truncate font-[family-name:var(--font-mono)] text-[var(--color-fg)]">{part.name}</span>
        <span className="flex-none text-[var(--color-accent)]">✓ Completed</span>
        {part.durationMs != null && <span className="ml-auto flex-none text-[var(--color-faint)]">Thời gian: {(part.durationMs / 1000).toFixed(2)}s</span>}
      </div>
      <div className="border-t border-[var(--color-border-soft)]">
        <Disclosure header={<span className="font-semibold text-[var(--color-muted)]">Kết quả</span>}>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-muted)]">{part.result}</pre>
        </Disclosure>
      </div>
    </div>
  );
}

/* Server selector dropdown ------------------------------------------------- */
function ServerSelect({ servers, value, onChange }: { servers: ServerRow[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = servers.find((s) => s.id === value);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex min-w-[220px] items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-sm transition-colors hover:border-[#2f3f37]">
        <span className="dot text-[var(--color-accent)]" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{cur?.name ?? "Chọn server"}</span>
          {cur?.host && <span className="block truncate text-[11px] text-[var(--color-faint)] font-[family-name:var(--font-mono)]">{cur.host}</span>}
        </span>
        <IconChevron className="ml-auto h-4 w-4 flex-none text-[var(--color-faint)]" />
      </button>
      {open && (
        <div className="card absolute left-0 z-30 mt-1 max-h-72 w-72 overflow-auto p-1 shadow-xl fade-up">
          {servers.length === 0 && <div className="px-3 py-4 text-sm text-[var(--color-muted)]">Chưa có server nào.</div>}
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                s.id === value ? "bg-[var(--color-accent-soft)] text-[var(--color-fg)]" : "text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-fg)]"
              }`}
            >
              <span className="dot flex-none text-[var(--color-accent)]" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.name}</span>
                {s.host && <span className="block truncate text-[11px] text-[var(--color-faint)] font-[family-name:var(--font-mono)]">{s.host}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Main content ------------------------------------------------------------- */
function ChatContent() {
  const searchParams = useSearchParams();
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [serverId, setServerId] = useState<string>("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeSkill, setActiveSkill] = useState<string>("");

  const [convId, setConvId] = useState<string>("");
  const [convList, setConvList] = useState<ConvMeta[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => {
    fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ConvMeta[]) => setConvList(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Bootstrap: fresh conversation + load servers, skills, history list.
  useEffect(() => {
    setConvId(newId());
    setMessages([]);
    try {
      setModel(localStorage.getItem("chat:model") || "");
    } catch {
      /* ignore */
    }

    fetch("/api/be/servers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { id: string; name: string; ssh?: { host?: string } }[]) => {
        const rows: ServerRow[] = (Array.isArray(d) ? d : []).map((s) => ({ id: String(s.id), name: s.name, host: s.ssh?.host ?? "" }));
        setServers(rows);
        const want = searchParams.get("server");
        setServerId(want && rows.some((r) => r.id === want) ? want : rows[0]?.id ?? "");
      })
      .catch(() => {});

    fetch("/api/be/skills")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSkills(Array.isArray(d) ? d : []))
      .catch(() => {});

    loadList();
  }, [searchParams, loadList]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Persist the active conversation after each completed turn (streaming -> false).
  useEffect(() => {
    if (streaming || messages.length === 0 || !convId) return;
    const title = deriveTitle(messages);
    const sid = serverId || null;
    fetch(`/api/conversations/${convId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, serverId: sid, messages }),
    })
      .then(() => {
        // Optimistically bump this conversation to the top of the list.
        setConvList((prev) => {
          const rest = prev.filter((c) => c.id !== convId);
          return [{ id: convId, title, serverId: sid, updatedAt: new Date().toISOString() }, ...rest];
        });
      })
      .catch(() => {});
    // Intentionally only on streaming transition (not on every message edit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const rank = (k: string) => {
    const idx = SKILL_ORDER.indexOf(k);
    return idx === -1 ? SKILL_ORDER.length : idx;
  };
  const sortedSkills = [...skills].sort((a, b) => rank(a.key) - rank(b.key));

  function newChat() {
    if (streaming) return;
    setConvId(newId());
    setMessages([]);
    setError("");
    setActiveSkill("");
  }

  async function selectConv(id: string) {
    if (streaming || id === convId) return;
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const row = await res.json();
      setConvId(row.id);
      setMessages(Array.isArray(row.messages) ? row.messages : []);
      if (row.serverId) setServerId(String(row.serverId));
      setError("");
    } catch {
      /* ignore */
    }
  }

  async function deleteConv(id: string) {
    if (streaming) return;
    if (!confirm("Xóa hội thoại này?")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
    setConvList((prev) => prev.filter((c) => c.id !== id));
    if (id === convId) newChat();
  }

  /** Patch the parts of a specific assistant message (by index). */
  const patchAt = (index: number, fn: (parts: Part[]) => { parts: Part[]; content?: string }) =>
    setMessages((prev) => {
      const cur = prev[index];
      if (!cur || cur.role !== "assistant") return prev;
      const out = fn([...(cur.parts ?? [])]);
      const next = [...prev];
      next[index] = { ...cur, parts: out.parts, content: out.content ?? cur.content };
      return next;
    });

  function setConfirmStatus(msgIndex: number, partIndex: number, status: ConfirmStatus) {
    setMessages((prev) =>
      prev.map((m, i) =>
        i !== msgIndex || !m.parts
          ? m
          : { ...m, parts: m.parts.map((p, j) => (j === partIndex && p.kind === "confirm" ? { ...p, status } : p)) }
      )
    );
  }

  /** Consume an SSE chat stream into the assistant message at `targetIndex`. */
  async function consumeStream(res: Response, targetIndex: number) {
    if (!res.ok || !res.body) throw new Error(`Máy chủ trả về lỗi (${res.status}).`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const toolStarts: number[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const ev of events) {
        const line = ev.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let data: { type?: string; text?: string; name?: string; args?: unknown; result?: unknown; message?: string; reason?: string; remember_ok?: boolean };
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }
        switch (data.type) {
          case "thought":
            if (data.text) patchAt(targetIndex, (parts) => ({ parts: [...parts, { kind: "thought", text: data.text! }] }));
            break;
          case "tool_call":
            toolStarts.push(Date.now());
            patchAt(targetIndex, (parts) => ({ parts: [...parts, { kind: "tool_call", name: data.name ?? "tool", args: data.args, running: true }] }));
            break;
          case "tool_result": {
            const started = toolStarts.shift();
            const durationMs = started != null ? Date.now() - started : undefined;
            patchAt(targetIndex, (parts) => {
              const np = parts.map((p) => (p.kind === "tool_call" && p.running ? { ...p, running: false } : p));
              np.push({ kind: "tool_result", name: data.name ?? "tool", result: stringify(data.result), durationMs });
              return { parts: np };
            });
            break;
          }
          case "confirm_required":
            patchAt(targetIndex, (parts) => ({
              parts: [
                ...parts,
                {
                  kind: "confirm",
                  name: data.name ?? "tool",
                  args: data.args && typeof data.args === "object" ? (data.args as Record<string, unknown>) : {},
                  reason: data.reason || "Hành động này có thể ảnh hưởng tới hệ thống.",
                  rememberOk: !!data.remember_ok,
                  status: "pending",
                },
              ],
            }));
            break;
          case "final":
            if (data.text)
              patchAt(targetIndex, (parts) => {
                const np = [...parts];
                const last = np[np.length - 1];
                if (last && last.kind === "text") np[np.length - 1] = { kind: "text", text: last.text + data.text! };
                else np.push({ kind: "text", text: data.text! });
                return { parts: np, content: (np.filter((p) => p.kind === "text") as { text: string }[]).map((p) => p.text).join("") };
              });
            break;
          case "error":
            setError(data.message || "Đã xảy ra lỗi khi xử lý.");
            break;
        }
      }
    }
    patchAt(targetIndex, (parts) => ({ parts: parts.map((p) => (p.kind === "tool_call" && p.running ? { ...p, running: false } : p)) }));
  }

  async function send(text: string, skill?: string) {
    const content = text.trim();
    if ((!content && !skill) || streaming) return;
    if (!serverId) {
      setError("Hãy chọn một server trước khi chat.");
      return;
    }
    setError("");
    if (skill) setActiveSkill(skill);

    const now = new Date();
    const userMsg: Msg = { role: "user", content: content || (skill ? `[Skill] ${SKILL_LABELS[skill] ?? skill}` : ""), time: hhmm(now) };
    const assistantMsg: Msg = { role: "assistant", content: "", parts: [], time: hhmm(now) };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const aIdx = messages.length + 1; // user at messages.length, assistant next

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch(`/api/be/servers/${serverId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: userMsg.role, content: userMsg.content }],
          ...(skill ? { skill } : {}),
          ...(model ? { model } : {}),
        }),
      });
      await consumeStream(res, aIdx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối tới máy chủ.");
    } finally {
      setStreaming(false);
    }
  }

  /** Resume after a confirm card: One-time / Always / No. */
  async function confirmAction(msgIndex: number, partIndex: number, mode: "once" | "always" | "no") {
    if (streaming) return;
    const part = messages[msgIndex]?.parts?.[partIndex];
    if (!part || part.kind !== "confirm" || part.status !== "pending") return;
    if (mode === "no") {
      setConfirmStatus(msgIndex, partIndex, "cancelled");
      patchAt(msgIndex, (parts) => ({ parts: [...parts, { kind: "text", text: "Đã hủy hành động." }] }));
      return;
    }
    if (!serverId) return;
    setError("");
    setConfirmStatus(msgIndex, partIndex, "running");
    setStreaming(true);
    const history = messages.slice(0, msgIndex + 1).map((m) => ({ role: m.role, content: m.content }));
    try {
      const res = await fetch(`/api/be/servers/${serverId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          confirm: { name: part.name, args: part.args, remember: mode === "always" },
          ...(model ? { model } : {}),
        }),
      });
      setConfirmStatus(msgIndex, partIndex, "confirmed");
      await consumeStream(res, msgIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối tới máy chủ.");
      setConfirmStatus(msgIndex, partIndex, "pending");
    } finally {
      setStreaming(false);
    }
  }

  function markActionDone(msgIndex: number) {
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, actionDone: true } : m)));
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-muted)]">Server</span>
          <ServerSelect servers={servers} value={serverId} onChange={setServerId} />
          <ApprovalsButton serverId={serverId} />
        </div>
        {sortedSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[var(--color-muted)]">Skill</span>
            {sortedSkills.map((s) => (
              <button
                key={s.key}
                onClick={() => send("", s.key)}
                disabled={streaming}
                title={s.prompt}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  activeSkill === s.key
                    ? "border border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                }`}
              >
                {SKILL_LABELS[s.key] ?? s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main: history + chat */}
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* History sidebar (left) */}
        <aside className="hidden min-h-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] lg:flex">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="text-sm font-semibold">Lịch sử chat</h3>
            <button onClick={newChat} disabled={streaming} className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-50" aria-label="Hội thoại mới">
              <IconPlus className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {convList.length === 0 && <div className="px-3 py-6 text-center text-xs text-[var(--color-faint)]">Chưa có hội thoại nào được lưu.</div>}
            {convList.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                  c.id === convId ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-panel-2)]"
                }`}
              >
                <button onClick={() => selectConv(c.id)} className="min-w-0 flex-1 text-left">
                  <div className={`truncate text-sm ${c.id === convId ? "text-[var(--color-fg)]" : "text-[var(--color-muted)]"}`}>{c.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--color-faint)]">{fmtWhen(c.updatedAt)}</div>
                </button>
                <button onClick={() => deleteConv(c.id)} disabled={streaming} className="grid h-7 w-7 flex-none place-items-center rounded-md text-[var(--color-faint)] opacity-0 transition-opacity hover:text-[var(--color-danger)] group-hover:opacity-100 disabled:opacity-0" aria-label="Xóa hội thoại">
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Chat column */}
        <div className="flex min-h-0 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[#0c100f] p-5">
            {empty ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mình có thể giúp gì cho bạn?</h2>
                <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">Chọn một server rồi hỏi về ổ đĩa, dịch vụ, log… hoặc thử một gợi ý:</p>
                <div className="mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2.5">
                  {SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      disabled={streaming}
                      className="rounded-full border border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] px-4 py-2 text-sm text-[var(--color-fg)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m, i) => {
                  if (m.role === "user") {
                    return (
                      <div key={i} className="flex flex-col items-end gap-1.5">
                        <span className="text-xs text-[var(--color-faint)]">Hôm nay {m.time}</span>
                        <div className="flex items-start gap-2.5">
                          <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm border border-[rgba(33,208,122,0.25)] bg-[var(--color-accent-soft)] px-4 py-2.5 text-sm leading-relaxed">{m.content}</div>
                          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--color-panel-2)] text-xs font-bold text-[var(--color-muted)]">AD</span>
                        </div>
                      </div>
                    );
                  }
                  const action = !m.actionDone ? diskAction(m.parts) : null;
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <AiAvatar />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">AI Assistant</span>
                          <span className="text-xs text-[var(--color-faint)]">Hôm nay {m.time}</span>
                        </div>
                        {m.parts && m.parts.length > 0 ? (
                          m.parts.map((p, pi) =>
                            p.kind === "confirm" ? (
                              <ConfirmCard key={pi} part={p} disabled={streaming} onPick={(mode) => confirmAction(i, pi, mode)} />
                            ) : (
                              <PartView key={pi} part={p} streaming={streaming && i === messages.length - 1} isLastPart={pi === (m.parts?.length ?? 0) - 1} />
                            )
                          )
                        ) : streaming && i === messages.length - 1 ? (
                          <span className="inline-flex gap-1 text-[var(--color-accent)]">
                            <span className="dot pulse" />
                            <span className="dot pulse" style={{ animationDelay: "0.2s" }} />
                            <span className="dot pulse" style={{ animationDelay: "0.4s" }} />
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--color-faint)]">(không có nội dung)</span>
                        )}

                        {action && !streaming && i === messages.length - 1 && (
                          <div className="rounded-xl border border-[rgba(240,180,41,0.35)] bg-[var(--color-warn-soft)] p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-warn)]">⚠ Hành động có thể giải phóng dung lượng</div>
                            <div className="mt-1 text-sm text-[var(--color-fg)]">
                              Tổng dung lượng có thể giải phóng: <span className="font-semibold">{action.total}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--color-muted)]">Các mục sẽ được xóa vĩnh viễn. Vui lòng xác nhận để tiếp tục.</div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => {
                                  markActionDone(i);
                                  send("Xác nhận: hãy thực hiện dọn dẹp thật (gọi optimize_disk với dry_run=false) cho các mục an toàn đã liệt kê.");
                                }}
                                className="btn px-4 text-sm"
                                style={{ backgroundColor: "var(--color-warn)", color: "#1c1606" }}
                              >
                                Xác nhận chạy
                              </button>
                              <button onClick={() => markActionDone(i)} className="btn btn-ghost px-4 text-sm">Hủy</button>
                              <button
                                onClick={() => {
                                  markActionDone(i);
                                  send("Chạy lại phân tích dung lượng đĩa (analyze_disk_usage, dry-run).");
                                }}
                                className="btn btn-ghost px-4 text-sm"
                              >
                                Chạy lại dry-run
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <div className="mt-2 rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div>}

          {/* Composer */}
          <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2.5">
            <div className="flex items-end gap-2">
              <button className="grid h-9 w-9 flex-none place-items-center rounded-lg text-[var(--color-faint)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-50" aria-label="Đính kèm" disabled>
                <IconPaperclip className="h-[18px] w-[18px]" />
              </button>
              <textarea
                className="max-h-32 min-h-[24px] flex-1 resize-none border-0 bg-transparent py-1.5 text-sm text-[var(--color-fg)] outline-none placeholder:text-[var(--color-faint)]"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Nhập câu hỏi của bạn... (Enter để gửi, Shift+Enter xuống dòng)"
                aria-label="Tin nhắn"
                disabled={streaming}
              />
              <button
                onClick={() => send(input)}
                disabled={streaming || !input.trim()}
                className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--color-accent)] text-[#07140d] transition-colors hover:bg-[var(--color-accent-strong)] disabled:opacity-50"
                aria-label="Gửi"
              >
                <IconSend className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 border-t border-[var(--color-border-soft)] pt-1.5 text-xs text-[var(--color-muted)]">
              <IconSparkle className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              <span className="font-medium">{model || "Model mặc định"}</span>
              <span className="text-[var(--color-faint)]">· Chế độ thông minh (dùng công cụ)</span>
              <Link href="/chat/models" className="ml-auto text-[var(--color-accent)] hover:underline">Đổi model</Link>
            </div>
          </div>

          <p className="mt-2 text-center text-[11px] text-[var(--color-faint)]">
            Nội dung do AI tạo chỉ mang tính tham khảo. Bạn tự chịu trách nhiệm với mọi quyết định và hành động dựa trên nó.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-muted)]">Đang tải…</p>}>
      <ChatContent />
    </Suspense>
  );
}
