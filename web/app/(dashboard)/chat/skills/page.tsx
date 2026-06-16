"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Skill {
  key: string;
  name: string;
  category: string;
  prompt: string;
}

/** Skills tab: preset diagnosis skills the AI runs using its tools. */
export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/be/skills")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSkills(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full overflow-y-auto pr-1">
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Bộ kỹ năng chẩn đoán dựng sẵn — mỗi kỹ năng là một quy trình AI tự chạy bằng các công cụ. Bấm vào tab{" "}
        <Link href="/chat" className="text-[var(--color-accent)] hover:underline">Chat</Link> rồi chọn chip Skill tương ứng để chạy.
      </p>

      {loading ? (
        <div className="card p-6 text-center text-sm text-[var(--color-muted)]">Đang tải…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {skills.map((s) => (
            <div key={s.key} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{s.name}</h3>
                <span className="pill pill-on">{s.category}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{s.prompt}</p>
              <div className="mt-2 font-[family-name:var(--font-mono)] text-xs text-[var(--color-faint)]">key: {s.key}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
