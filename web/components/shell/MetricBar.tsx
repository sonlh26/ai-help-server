"use client";

/** Thin horizontal metric bar with color thresholds. Shows "--" when null. */
export default function MetricBar({
  label,
  percent,
}: {
  label: string;
  /** 0-100, or null when unknown / offline. */
  percent: number | null;
}) {
  const known = percent != null && Number.isFinite(percent);
  const pct = known ? Math.max(0, Math.min(100, percent as number)) : 0;
  const color =
    pct >= 90
      ? "var(--color-danger)"
      : pct >= 70
        ? "var(--color-warn)"
        : "var(--color-accent)";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-[var(--color-muted)]">
          {label}
        </span>
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: known ? color : "var(--color-faint)" }}
        >
          {known ? `${Math.round(pct)}%` : "--"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#0e1412]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: known ? `${pct}%` : "0%",
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
