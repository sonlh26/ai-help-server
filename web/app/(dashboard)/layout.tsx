import AppShell from "@/components/shell/AppShell";

/**
 * Dashboard route-group layout = the authenticated app shell (sidebar + topbar).
 * Route groups don't affect URLs, so pages inside keep their original paths
 * (/, /servers/[id], /admin, /alerts, ...).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
