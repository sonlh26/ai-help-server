"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "./Brand";
import {
  IconAdmin,
  IconAlerts,
  IconChat,
  IconMoon,
  IconServers,
  IconSettings,
  IconSun,
} from "./icons";

export interface ShellUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
  badge?: number;
  adminOnly?: boolean;
  /** Match prefix (sub-routes count as active). */
  match?: (pathname: string) => boolean;
}

const roleLabels: Record<string, string> = {
  admin: "Quản trị",
  member: "Thành viên",
  viewer: "Người xem",
};

function initials(nameOrEmail: string): string {
  const base = (nameOrEmail || "").trim();
  if (!base) return "?";
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export default function Sidebar({
  user,
  alertCount,
  theme,
  onToggleTheme,
  onNavigate,
}: {
  user: ShellUser | null;
  alertCount: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  /** Called after a nav link click (used to close the mobile drawer). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isAdmin = user?.role === "admin";

  const nav: NavItem[] = [
    {
      href: "/",
      label: "Servers",
      icon: IconServers,
      match: (p) => p === "/" || p.startsWith("/servers"),
    },
    { href: "/chat", label: "Chat AI", icon: IconChat },
    {
      href: "/alerts",
      label: "Alerts",
      icon: IconAlerts,
      badge: alertCount,
    },
    { href: "/settings", label: "Settings", icon: IconSettings },
    { href: "/admin", label: "Admin", icon: IconAdmin, adminOnly: true },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)]">
      {/* Brand */}
      <div className="flex h-16 items-center px-5">
        <Link href="/" onClick={onNavigate} aria-label="AI Help">
          <BrandLockup />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {nav.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          const active = item.match
            ? item.match(pathname)
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-fg)]"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[var(--color-accent)]" />
              )}
              <Icon className="h-[18px] w-[18px] flex-none" />
              <span className="flex-1">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-[11px] font-bold text-white">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: user card + theme toggle + version */}
      <div className="space-y-3 border-t border-[var(--color-border)] p-3">
        <div className="flex items-center gap-3 rounded-lg bg-[#0e1412] px-3 py-2.5">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--color-accent-soft)] text-sm font-bold text-[var(--color-accent)]">
            {initials(user?.name || user?.email || "")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-[var(--color-fg)]">
              {user?.email ?? "…"}
            </p>
            <span className="mt-0.5 inline-block text-[11px] font-semibold text-[var(--color-accent)]">
              {roleLabels[user?.role ?? ""] ?? user?.role ?? ""}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Đổi giao diện sáng/tối"
            title="Đổi giao diện (thử nghiệm)"
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            {theme === "dark" ? (
              <IconMoon className="h-4 w-4" />
            ) : (
              <IconSun className="h-4 w-4" />
            )}
            <span>{theme === "dark" ? "Tối" : "Sáng"}</span>
          </button>
          <span className="text-[11px] text-[var(--color-faint)]">v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
