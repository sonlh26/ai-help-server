"use client";

import { clampPct, pctColor } from "@/components/server/format";

/** Disk-usage donut built from a conic-gradient ring (matches Gauge style). */
export default function Donut({
  percent,
  centerLabel,
  centerSub,
}: {
  percent: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const pct = clampPct(percent);
  const color = pctColor(pct);
  const track = "#1b2421";

  return (
    <div
      className="relative grid h-36 w-36 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${pct * 3.6}deg, ${track} 0deg)`,
        transition: "background 0.4s ease",
      }}
      role="img"
      aria-label={`Sử dụng: ${Math.round(pct)}%`}
    >
      <div className="absolute inset-[14px] grid place-items-center rounded-full bg-[var(--color-panel)] text-center">
        <div>
          <div className="text-2xl font-semibold tabular-nums" style={{ color }}>
            {centerLabel ?? `${Math.round(pct)}%`}
          </div>
          {centerSub && (
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)] font-[family-name:var(--font-mono)]">
              {centerSub}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
