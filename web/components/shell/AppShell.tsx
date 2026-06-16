"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar, { type ShellUser } from "./Sidebar";
import Topbar from "./Topbar";

interface Me {
  authenticated: boolean;
  user?: ShellUser;
}

interface AlertsResp {
  alerts?: { level: string; message: string; server_id: string; created_at: string }[];
  services?: { server_id: string; name: string; active: boolean; checked_at: string }[];
}

/**
 * Persistent application shell: left sidebar + top bar around routed content.
 * Client component — fetches /api/me for role/user and /api/be/alerts for the
 * notification badge. The search box broadcasts a "shell:search" window event
 * that the Servers screen listens to.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ShellUser | null>(null);
  const [errorAlerts, setErrorAlerts] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((d: Me) => setUser(d.user ?? null))
      .catch(() => setUser(null));

    fetch("/api/be/alerts")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: AlertsResp) => {
        const count = (d.alerts ?? []).filter(
          (a) => a.level === "error" || a.level === "critical"
        ).length;
        setErrorAlerts(count);
      })
      .catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    // Theme toggle stub — dark is the only fully-themed mode for now.
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar (persistent) */}
      <div className="hidden lg:block">
        <Sidebar
          user={user}
          alertCount={errorAlerts}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full fade-up">
            <Sidebar
              user={user}
              alertCount={errorAlerts}
              theme={theme}
              onToggleTheme={toggleTheme}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          hasUnread={errorAlerts > 0}
          onOpenSidebar={() => setDrawerOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
