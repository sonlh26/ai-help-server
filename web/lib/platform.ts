/**
 * Shared, extensible platform badge helper.
 *
 * Maps a server's detected control panel / web server (from the overview
 * `platform` field) to a small badge label + Tailwind classes. Used by both
 * ServerCard and the server detail header (DRY).
 *
 * To support a new panel later: add one entry to PANEL_BADGES.
 */

export type Platform = {
  panel: string | null;
  web_server: string | null;
  self_configured?: boolean;
} | null;

export interface BadgeStyle {
  label: string;
  /** Tailwind classes for the badge chip (color + border + bg). */
  className: string;
}

/** Neutral chip used for non-aaPanel panels / web servers / SSH fallback. */
const NEUTRAL =
  "border-[var(--color-border)] bg-[var(--color-panel-2)] text-[var(--color-muted)]";

/** Accent (green) chip — aaPanel is the only API-integrated panel. */
const ACCENT =
  "border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]";

/** Known control panels → label + classes. Extend here for future panels. */
const PANEL_BADGES: Record<string, BadgeStyle> = {
  aapanel: { label: "aaPanel", className: ACCENT },
  cpanel: { label: "cPanel", className: NEUTRAL },
  plesk: { label: "Plesk", className: NEUTRAL },
  directadmin: { label: "DirectAdmin", className: NEUTRAL },
  cyberpanel: { label: "CyberPanel", className: NEUTRAL },
  webmin: { label: "Webmin", className: NEUTRAL },
};

/** Web server pretty labels for the "tự cấu hình" (self-configured) case. */
const WEB_SERVER_LABELS: Record<string, string> = {
  nginx: "nginx",
  apache: "apache",
  openlitespeed: "OpenLiteSpeed",
};

/**
 * Resolve a platform descriptor to a badge.
 * Priority: known panel → web server (self-configured) → "SSH".
 */
export function platformBadge(p: Platform): BadgeStyle {
  if (p?.panel) {
    const known = PANEL_BADGES[p.panel];
    if (known) return known;
    // Unknown but present panel: show its raw key, neutral styling.
    return { label: p.panel, className: NEUTRAL };
  }
  if (p?.web_server) {
    const label = WEB_SERVER_LABELS[p.web_server] ?? p.web_server;
    return { label, className: NEUTRAL };
  }
  return { label: "SSH", className: NEUTRAL };
}
