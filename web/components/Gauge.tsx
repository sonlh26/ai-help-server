"use client";

/**
 * Circular gauge using a pure CSS conic-gradient ring (no chart library).
 * Color thresholds: green normally, amber >= 70%, red >= 90%.
 */
export default function Gauge({
  percent,
  label,
  sublabel,
}: {
  percent: number;
  label: string;
  sublabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  // Accent color by severity.
  const color =
    pct >= 90
      ? "var(--color-danger)"
      : pct >= 70
        ? "var(--color-warn)"
        : "var(--color-accent)";
  const track = "#1b2421"; // matches --color-border-soft

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        className="relative grid h-28 w-28 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${pct * 3.6}deg, ${track} 0deg)`,
          transition: "background 0.4s ease",
        }}
        role="img"
        aria-label={`${label}: ${pct}%`}
      >
        {/* Inner disc to create the ring */}
        <div className="absolute inset-[10px] grid place-items-center rounded-full bg-[var(--color-panel)]">
          <span
            className="text-xl font-semibold tabular-nums"
            style={{ color }}
          >
            {Math.round(pct)}
            <span className="text-sm font-medium">%</span>
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-[var(--color-fg)]">{label}</div>
        {sublabel && (
          <div className="mt-0.5 text-xs text-[var(--color-muted)] font-[family-name:var(--font-mono)]">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
