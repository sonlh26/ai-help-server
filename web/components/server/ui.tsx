"use client";

import { IconRefresh, IconWarning } from "@/components/server/icons";
import { clampPct, pctColor } from "@/components/server/format";
import type { ReactNode } from "react";

/** Compact stat tile used across tabs. */
export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div
        className={`mt-1 truncate text-lg font-semibold tabular-nums ${
          accent ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]"
        }`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}

/** Label/value row for info cards. */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border-soft)] py-2 last:border-0">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className="text-right text-sm font-medium text-[var(--color-fg)] font-[family-name:var(--font-mono)]">
        {value}
      </span>
    </div>
  );
}

/** Thin usage bar with severity color. */
export function UsageBar({ percent }: { percent: number }) {
  const pct = clampPct(percent);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0e1412]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: pctColor(pct) }}
      />
    </div>
  );
}

/** Toolbar row: title (left) + refresh button (right). */
export function TabToolbar({
  title,
  onRefresh,
  loading,
  children,
}: {
  title: ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-[var(--color-muted)]">{title}</h2>
      <div className="flex items-center gap-2">
        {children}
        {onRefresh && (
          <button className="btn btn-ghost py-1.5 text-sm" onClick={onRefresh} disabled={loading}>
            <IconRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Đang tải…" : "Làm mới"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-danger)]">
      {children}
    </div>
  );
}

export function WarnBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[#3a2f10] bg-[var(--color-warn-soft)] px-3 py-2.5 text-sm text-[var(--color-warn)]">
      <IconWarning className="mt-0.5 h-4 w-4 flex-none" />
      <span>{children}</span>
    </div>
  );
}

/** Centered empty/disabled state inside a card. */
export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <div className="card p-8 text-center text-sm text-[var(--color-muted)]">{children}</div>
  );
}

/** Loading state card. */
export function LoadingCard({ text = "Đang tải dữ liệu…" }: { text?: string }) {
  return <div className="card p-8 text-center text-sm text-[var(--color-muted)]">{text}</div>;
}
