"use client";

import { signOut } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ShellUser } from "./Sidebar";
import { IconBell, IconChevron, IconLogout, IconMenu, IconSearch } from "./icons";

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

export default function Topbar({
  user,
  hasUnread,
  onOpenSidebar,
}: {
  user: ShellUser | null;
  /** Show red dot on the bell when there are unread error alerts. */
  hasUnread: boolean;
  onOpenSidebar: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Broadcast search to the page (Servers screen listens for this).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("shell:search", { detail: search })
    );
  }, [search]);

  // Close user menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--color-border)] bg-[rgba(10,13,12,0.82)] px-4 backdrop-blur-md sm:px-6">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Mở menu"
        className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] lg:hidden"
      >
        <IconMenu className="h-[18px] w-[18px]" />
      </button>

      {/* Search */}
      <div className="relative max-w-md flex-1">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--color-faint)]" />
        <input
          className="input pl-10"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm server..."
          aria-label="Tìm server"
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Bell */}
        <Link
          href="/alerts"
          aria-label="Cảnh báo"
          className="relative grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          <IconBell className="h-[18px] w-[18px]" />
          {hasUnread && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--color-danger)] ring-2 ring-[var(--color-bg)]" />
          )}
        </Link>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] py-1 pl-1 pr-2 text-sm transition-colors hover:border-[#2f3f37]"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-accent-soft)] text-xs font-bold text-[var(--color-accent)]">
              {initials(user?.name || user?.email || "")}
            </span>
            <IconChevron className="h-4 w-4 text-[var(--color-faint)]" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="card absolute right-0 mt-2 w-60 overflow-hidden p-0 shadow-xl fade-up"
            >
              <div className="border-b border-[var(--color-border-soft)] px-4 py-3">
                <p className="truncate text-sm font-medium">
                  {user?.email ?? "…"}
                </p>
                <span className="mt-1 inline-block text-xs font-semibold text-[var(--color-accent)]">
                  {roleLabels[user?.role ?? ""] ?? user?.role ?? ""}
                </span>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-panel-2)]"
              >
                <IconLogout className="h-[18px] w-[18px] text-[var(--color-muted)]" />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
