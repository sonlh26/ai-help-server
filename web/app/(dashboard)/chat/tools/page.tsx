"use client";

import { useEffect, useState } from "react";

interface ToolParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
}
interface Tool {
  name: string;
  description: string;
  params: ToolParam[];
}

/** Tools tab: the real list of tools the AI agent can call (from the backend
    registry), with descriptions and parameters. */
export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/be/tools")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTools(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full overflow-y-auto pr-1">
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        {tools.length > 0 ? `${tools.length} công cụ` : "Công cụ"} mà trợ lý AI có thể tự gọi để lấy dữ liệu và thao tác
        trên server. AI chọn công cụ phù hợp theo câu hỏi của bạn.
      </p>

      {loading ? (
        <div className="card p-6 text-center text-sm text-[var(--color-muted)]">Đang tải…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((t) => (
            <div key={t.name} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="dot text-[var(--color-accent)]" />
                <h3 className="font-[family-name:var(--font-mono)] text-sm font-semibold">{t.name}</h3>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{t.description}</p>
              {t.params.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.params.map((p) => (
                    <span key={p.name} className="pill" title={`${p.type}${p.description ? " — " + p.description : ""}`}>
                      {p.name}
                      {p.required && <span className="text-[var(--color-danger)]">*</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
