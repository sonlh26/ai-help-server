"use client";

import { useEffect, useState } from "react";

interface ModelsResp {
  provider: string;
  current: string;
  models: string[];
  error?: string | null;
}

/** Models tab: list models from the LLM provider API and let the user pick the
    one used for their chats. The choice is stored locally and sent with each
    chat request as a per-request override (empty = use admin default). */
export default function ModelsPage() {
  const [data, setData] = useState<ModelsResp | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setSelected(localStorage.getItem("chat:model") || "");
    } catch {
      /* ignore */
    }
    fetch("/api/be/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ModelsResp | null) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function choose(m: string) {
    setSelected(m);
    try {
      if (m) localStorage.setItem("chat:model", m);
      else localStorage.removeItem("chat:model");
    } catch {
      /* ignore */
    }
  }

  const models = data?.models ?? [];

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <span>Chọn model AI cho cuộc trò chuyện của bạn.</span>
        {data?.provider && <span className="pill">provider: {data.provider}</span>}
        {data?.current && <span className="pill pill-on">mặc định: {data.current}</span>}
      </div>

      {data?.error && (
        <div className="mb-4 rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
          Không lấy được danh sách model từ provider: {data.error}
        </div>
      )}

      {loading ? (
        <div className="card p-6 text-center text-sm text-[var(--color-muted)]">Đang tải…</div>
      ) : (
        <div className="space-y-2">
          {/* Default option */}
          <button
            onClick={() => choose("")}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              selected === "" ? "border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] hover:border-[#2f3f37]"
            }`}
          >
            <div>
              <div className="text-sm font-medium">Mặc định (admin cấu hình)</div>
              <div className="text-xs text-[var(--color-muted)]">Dùng model hệ thống{data?.current ? `: ${data.current}` : ""}.</div>
            </div>
            {selected === "" && <span className="text-sm font-semibold text-[var(--color-accent)]">✓ Đang dùng</span>}
          </button>

          {models.map((m) => (
            <button
              key={m}
              onClick={() => choose(m)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                selected === m ? "border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] hover:border-[#2f3f37]"
              }`}
            >
              <span className="truncate font-[family-name:var(--font-mono)] text-sm">{m}</span>
              {selected === m && <span className="flex-none text-sm font-semibold text-[var(--color-accent)]">✓ Đang dùng</span>}
            </button>
          ))}

          {models.length === 0 && !data?.error && (
            <div className="card p-6 text-center text-sm text-[var(--color-muted)]">Provider chưa trả về model nào.</div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-[var(--color-faint)]">
        Lựa chọn được lưu trên trình duyệt này và áp dụng cho các tin nhắn mới trong tab Chat.
      </p>
    </div>
  );
}
