"use client";

import { useEffect, useRef, useState } from "react";

interface Skill {
  key: string;
  name: string;
  category: string;
  prompt: string;
}

type ConfirmStatus = "pending" | "running" | "confirmed" | "cancelled";

type Part =
  | { kind: "text"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "tool_call"; name: string; args: unknown }
  | { kind: "tool_result"; name: string; result: unknown }
  | {
      kind: "confirm";
      name: string;
      args: Record<string, unknown>;
      reason: string;
      rememberOk: boolean;
      status: ConfirmStatus;
    };

interface Msg {
  role: "user" | "assistant";
  /** plain text used to build the request payload */
  content: string;
  /** rich parts for assistant rendering (text, tool calls, …) */
  parts?: Part[];
}

function ToolCard({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "call" | "result" | "thought";
}) {
  const [open, setOpen] = useState(false);
  const color =
    tone === "result"
      ? "text-[var(--color-accent)]"
      : tone === "thought"
        ? "text-[var(--color-warn)]"
        : "text-[var(--color-muted)]";
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412] text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`min-w-0 truncate font-semibold ${color}`}>{title}</span>
        <span className="ml-auto flex-none text-[var(--color-faint)]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <pre className="max-w-full overflow-x-auto border-t border-[var(--color-border-soft)] px-3 py-2 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap break-words">
          {body}
        </pre>
      )}
    </div>
  );
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Human description of the action to be confirmed, formatted per tool. */
function describeConfirm(
  name: string,
  args: Record<string, unknown>
): { label: string; command?: string; fallbackJson?: string } {
  switch (name) {
    case "run_ssh_command":
      return { label: "Lệnh:", command: asStr(args.command) };
    case "optimize_disk":
      return { label: "Dọn dẹp ổ cứng (thực thi thật)." };
    case "service_action":
    case "aapanel_service_admin":
      return { label: `${asStr(args.action)} dịch vụ ${asStr(args.name)}`.trim() };
    case "aapanel_site_action":
      return { label: `${asStr(args.action)} website ${asStr(args.site_name)}`.trim() };
    default:
      return { label: name, fallbackJson: stringify(args) };
  }
}

/** Confirmation card shown in the message stream for a risky action. */
function ConfirmCard({
  part,
  onConfirm,
  onCancel,
}: {
  part: Extract<Part, { kind: "confirm" }>;
  onConfirm: (remember: boolean) => void;
  onCancel: () => void;
}) {
  const { label, command, fallbackJson } = describeConfirm(part.name, part.args);
  const { status } = part;
  const busy = status === "running";
  const settled = status === "confirmed" || status === "cancelled";

  return (
    <div className="rounded-xl border border-[var(--color-warn)] bg-[rgba(245,178,64,0.06)] text-sm">
      <div className="flex items-center gap-2 border-b border-[rgba(245,178,64,0.25)] px-3.5 py-2.5">
        {/* Shield / warning icon */}
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[var(--color-warn)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3l8 3v5c0 4.5-3.1 7.7-8 9-4.9-1.3-8-4.5-8-9V6l8-3z" />
          <path d="M12 9v4" />
          <path d="M12 16h.01" />
        </svg>
        <span className="font-semibold text-[var(--color-warn)]">Cần xác nhận hành động</span>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        <p className="leading-relaxed text-[var(--color-muted)]">{part.reason}</p>

        {command !== undefined ? (
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--color-faint)]">{label}</div>
            <pre className="max-w-full overflow-x-auto rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412] px-3 py-2 font-[family-name:var(--font-mono)] text-[12px] leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap break-words">
              {command}
            </pre>
          </div>
        ) : fallbackJson !== undefined ? (
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--color-faint)]">{label}</div>
            <pre className="max-w-full overflow-x-auto rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412] px-3 py-2 font-[family-name:var(--font-mono)] text-[12px] leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap break-words">
              {fallbackJson}
            </pre>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--color-border-soft)] bg-[#0e1412] px-3 py-2 font-medium text-[var(--color-fg)]">
            {label}
          </div>
        )}

        {status === "confirmed" && (
          <div className="text-xs font-medium text-[var(--color-accent)]">✓ Đã xác nhận</div>
        )}
        {status === "cancelled" && (
          <div className="text-xs font-medium text-[var(--color-danger)]">Đã hủy</div>
        )}

        {!settled && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              onClick={() => onConfirm(false)}
              disabled={busy}
              className="btn btn-primary h-9 px-4 text-sm disabled:opacity-50"
            >
              {busy ? "Đang thực hiện…" : "Chỉ lần này"}
            </button>
            {part.rememberOk && (
              <button
                onClick={() => onConfirm(true)}
                disabled={busy}
                className="btn btn-ghost h-9 px-4 text-sm disabled:opacity-50"
              >
                Luôn cho phép
              </button>
            )}
            <button
              onClick={onCancel}
              disabled={busy}
              className="btn btn-ghost h-9 px-4 text-sm disabled:opacity-50"
            >
              Từ chối
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({
  parts,
  onConfirm,
  onCancel,
}: {
  parts: Part[];
  /** Confirm a pending confirm part (remember=true → "Always"). */
  onConfirm: (partIndex: number, remember: boolean) => void;
  /** Cancel a pending confirm part at the given part index. */
  onCancel: (partIndex: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      {parts.map((p, i) => {
        if (p.kind === "text")
          return (
            <div key={i} className="min-w-0 whitespace-pre-wrap break-words leading-relaxed text-sm">
              {p.text}
            </div>
          );
        if (p.kind === "thought")
          return <ToolCard key={i} tone="thought" title={`Suy nghĩ`} body={p.text} />;
        if (p.kind === "tool_call")
          return (
            <ToolCard
              key={i}
              tone="call"
              title={`Gọi công cụ · ${p.name}`}
              body={stringify(p.args)}
            />
          );
        if (p.kind === "confirm")
          return (
            <ConfirmCard
              key={i}
              part={p}
              onConfirm={(remember) => onConfirm(i, remember)}
              onCancel={() => onCancel(i)}
            />
          );
        return (
          <ToolCard
            key={i}
            tone="result"
            title={`Kết quả · ${p.name}`}
            body={stringify(p.result)}
          />
        );
      })}
    </div>
  );
}

/** Chat panel with SSE streaming to /api/be/servers/{id}/chat. */
export default function ChatPanel({ serverId }: { serverId: string }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/be/skills")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSkills(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  /** Append a part to the assistant message at index `aIdx` (text parts merge). */
  function pushPart(aIdx: number, part: Part) {
    setMessages((prev) => {
      const next = [...prev];
      const a = next[aIdx];
      if (!a) return prev;
      const parts = [...(a.parts ?? [])];
      if (part.kind === "text") {
        const last = parts[parts.length - 1];
        if (last && last.kind === "text") {
          parts[parts.length - 1] = { kind: "text", text: last.text + part.text };
        } else {
          parts.push(part);
        }
        next[aIdx] = { ...a, parts, content: a.content + part.text };
      } else {
        parts.push(part);
        next[aIdx] = { ...a, parts };
      }
      return next;
    });
  }

  /**
   * Read an SSE response and append events as parts into the assistant message
   * at `aIdx`. Reused by both the initial send and the confirm-resume path; the
   * latter may emit another `confirm_required`, handled recursively by the UI.
   */
  async function streamInto(res: Response, aIdx: number) {
    if (!res.ok || !res.body) {
      throw new Error(`Máy chủ trả về lỗi (${res.status}).`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";

      for (const ev of events) {
        const dataLine = ev.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const raw = dataLine.slice(5).trim();
        if (!raw) continue;
        let data: {
          type?: string;
          text?: string;
          name?: string;
          args?: unknown;
          result?: unknown;
          message?: string;
          reason?: string;
          remember_ok?: boolean;
        };
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }
        switch (data.type) {
          case "thought":
            if (data.text) pushPart(aIdx, { kind: "thought", text: data.text });
            break;
          case "tool_call":
            pushPart(aIdx, { kind: "tool_call", name: data.name ?? "tool", args: data.args });
            break;
          case "tool_result":
            pushPart(aIdx, { kind: "tool_result", name: data.name ?? "tool", result: data.result });
            break;
          case "confirm_required":
            pushPart(aIdx, {
              kind: "confirm",
              name: data.name ?? "tool",
              args:
                data.args && typeof data.args === "object"
                  ? (data.args as Record<string, unknown>)
                  : {},
              reason: data.reason || "Hành động này có thể ảnh hưởng tới hệ thống.",
              rememberOk: !!data.remember_ok,
              status: "pending",
            });
            break;
          case "final":
            if (data.text) pushPart(aIdx, { kind: "text", text: data.text });
            break;
          case "error":
            setError(data.message || "Đã xảy ra lỗi khi xử lý.");
            break;
          // "start" and "done" need no rendering.
        }
      }
    }
  }

  async function send(text: string, skill?: string) {
    const content = text.trim();
    if ((!content && !skill) || streaming) return;
    setError("");

    const history = [...messages];
    const userMsg: Msg = { role: "user", content: content || (skill ? `[${skill}]` : "") };
    const assistantMsg: Msg = { role: "assistant", content: "", parts: [] };
    setMessages([...history, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Index of the assistant message we mutate as the stream arrives.
    const aIdx = history.length + 1;

    const payloadMessages = [...history, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch(`/api/be/servers/${serverId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages, ...(skill ? { skill } : {}) }),
      });
      await streamInto(res, aIdx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối tới máy chủ.");
    } finally {
      setStreaming(false);
    }
  }

  /** Update the status of the confirm part at (msgIdx, partIdx). */
  function setConfirmStatus(msgIdx: number, partIdx: number, status: ConfirmStatus) {
    setMessages((prev) => {
      const next = [...prev];
      const m = next[msgIdx];
      if (!m?.parts) return prev;
      const part = m.parts[partIdx];
      if (!part || part.kind !== "confirm") return prev;
      const parts = [...m.parts];
      parts[partIdx] = { ...part, status };
      next[msgIdx] = { ...m, parts };
      return next;
    });
  }

  /** User confirmed the action → POST resume with the same history + confirm. */
  async function handleConfirm(msgIdx: number, partIdx: number, remember: boolean) {
    if (streaming) return;
    const part = messages[msgIdx]?.parts?.[partIdx];
    if (!part || part.kind !== "confirm" || part.status !== "pending") return;

    setError("");
    setConfirmStatus(msgIdx, partIdx, "running");
    setStreaming(true);

    // Resend the conversation so far in the SAME {role, content} shape used by
    // send(), up to and including the assistant turn that requested the confirm.
    const payloadMessages = messages
      .slice(0, msgIdx + 1)
      .map((m) => ({ role: m.role, content: m.content }));

    // Resulting events flow into the same assistant message.
    const aIdx = msgIdx;

    try {
      const res = await fetch(`/api/be/servers/${serverId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payloadMessages,
          confirm: { name: part.name, args: part.args, remember },
        }),
      });
      setConfirmStatus(msgIdx, partIdx, "confirmed");
      await streamInto(res, aIdx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối tới máy chủ.");
    } finally {
      setStreaming(false);
    }
  }

  /** User cancelled → mark card cancelled, append a note, no backend call. */
  function handleCancel(msgIdx: number, partIdx: number) {
    const part = messages[msgIdx]?.parts?.[partIdx];
    if (!part || part.kind !== "confirm" || part.status !== "pending") return;
    setConfirmStatus(msgIdx, partIdx, "cancelled");
    pushPart(msgIdx, { kind: "text", text: "Đã hủy hành động." });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex h-[68vh] min-h-[420px] flex-col">
      {/* Skill chips */}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-3">
          {skills.map((s) => (
            <button
              key={s.key}
              onClick={() => send("", s.key)}
              disabled={streaming}
              className="pill hover:border-[rgba(33,208,122,0.4)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-50"
              title={s.prompt}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--color-border)] bg-[#0c100f] p-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-sm text-[var(--color-faint)]">
            Bắt đầu trò chuyện với trợ lý AI — hỏi về trạng thái, dịch vụ hoặc dùng các kỹ năng nhanh phía trên.
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] min-w-0 whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[var(--color-accent-soft)] border border-[rgba(33,208,122,0.25)] px-3.5 py-2 text-sm leading-relaxed">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex min-w-0 justify-start">
              <div className="max-w-[92%] min-w-0 rounded-2xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-2.5 w-full">
                {m.parts && m.parts.length > 0 ? (
                  <AssistantBubble
                    parts={m.parts}
                    onConfirm={(partIdx, remember) => handleConfirm(i, partIdx, remember)}
                    onCancel={(partIdx) => handleCancel(i, partIdx)}
                  />
                ) : streaming && i === messages.length - 1 ? (
                  <span className="inline-flex gap-1 text-[var(--color-accent)]">
                    <span className="dot pulse" />
                    <span className="dot pulse" style={{ animationDelay: "0.2s" }} />
                    <span className="dot pulse" style={{ animationDelay: "0.4s" }} />
                  </span>
                ) : (
                  <span className="text-sm text-[var(--color-faint)]">(không có nội dung)</span>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {/* Composer */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          className="input flex-1 resize-none"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)"
          disabled={streaming}
        />
        <button
          className="btn btn-primary h-[46px] px-5"
          onClick={() => send(input)}
          disabled={streaming || !input.trim()}
        >
          Gửi
        </button>
      </div>
    </div>
  );
}
