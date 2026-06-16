"use client";

/**
 * Compact resource gauge for the service detail page.
 * Unlike <Gauge>, the ring shows an arbitrary primary value in the center
 * (e.g. "128 MB", "1.2 MB/s") with the percent as a small sub-line, plus an
 * optional caption rendered below the ring. Pure CSS conic-gradient ring.
 */
export default function ServiceGauge({
  percent,
  label,
  value,
  caption,
}: {
  percent: number;
  label: string;
  /** Primary text shown in the ring center (e.g. "2.4%", "128 MB"). */
  value: string;
  /** Caption under the ring (e.g. "0.05 / 2 vCPU"). */
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  const color =
    pct >= 90
      ? "var(--color-danger)"
      : pct >= 70
        ? "var(--color-warn)"
        : "var(--color-accent)";
  const track = "#1b2421"; // matches --color-border-soft

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="mb-0.5 text-xs font-medium text-[var(--color-muted)]">
        {label}
      </div>
      <div
        className="relative grid h-24 w-24 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${pct * 3.6}deg, ${track} 0deg)`,
          transition: "background 0.4s ease",
        }}
        role="img"
        aria-label={`${label}: ${value} (${Math.round(pct)}%)`}
      >
        <div className="absolute inset-[9px] grid place-items-center rounded-full bg-[var(--color-panel)] text-center">
          <span className="text-lg font-semibold tabular-nums text-[var(--color-fg)]">
            {value}
          </span>
          <span className="text-[11px] font-medium text-[var(--color-muted)] tabular-nums">
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      {caption && (
        <div className="text-center text-xs text-[var(--color-muted)] font-[family-name:var(--font-mono)]">
          {caption}
        </div>
      )}
    </div>
  );
}
