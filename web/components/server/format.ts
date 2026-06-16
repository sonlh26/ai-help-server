/** Byte/number formatting helpers shared across the server-detail tabs. */

/** Format a byte count into a human-readable string (B → GB/TB). */
export function fmtBytes(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const b = Math.max(0, bytes);
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let val = b / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}

/** Format MB → GB string when large enough. */
export function fmtMb(mb?: number | null): string {
  if (mb == null || !Number.isFinite(mb)) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Severity color for a percentage value (green / amber / red). */
export function pctColor(pct: number): string {
  if (pct >= 90) return "var(--color-danger)";
  if (pct >= 70) return "var(--color-warn)";
  return "var(--color-accent)";
}

/** Clamp a number to the 0–100 range, defaulting to 0 for non-finite input. */
export function clampPct(v?: number | null): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(100, n));
}
