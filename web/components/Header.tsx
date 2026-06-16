"use client";

import { signOut, useSession } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";

function RoleBadge({ role }: { role?: string | null }) {
  const r = role || "member";
  const map: Record<string, string> = {
    admin: "text-[var(--color-accent)] border-[rgba(33,208,122,0.4)] bg-[var(--color-accent-soft)]",
    member: "text-[var(--color-muted)] border-[var(--color-border)] bg-[#0e1412]",
    viewer: "text-[var(--color-faint)] border-[var(--color-border)] bg-[#0e1412]",
  };
  const labels: Record<string, string> = {
    admin: "Quản trị",
    member: "Thành viên",
    viewer: "Người xem",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${map[r] ?? map.member}`}
    >
      {labels[r] ?? r}
    </span>
  );
}

/** Top app bar: brand, role badge, admin link, logout. */
export default function Header() {
  const router = useRouter();
  const { data } = useSession();
  const role = data?.user?.role as string | undefined;

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[rgba(10,13,12,0.82)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-accent)] text-[#07140d] font-extrabold text-sm shadow-[0_0_18px_rgba(33,208,122,0.35)]">
            ai
          </span>
          <span className="font-semibold tracking-tight">
            AI Help
            <span className="ml-1 text-[var(--color-faint)] font-normal text-sm">
              Panel
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {role && <RoleBadge role={role} />}
          {role === "admin" && (
            <Link
              href="/admin"
              className="text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
            >
              Quản trị
            </Link>
          )}
          <button onClick={handleLogout} className="btn btn-ghost px-3 py-1.5 text-sm">
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
