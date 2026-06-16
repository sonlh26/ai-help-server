"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sub-navigation for the Chat AI section. Underline-style, matches Tabs.tsx. */
const TABS = [
  { href: "/chat", label: "Chat" },
  { href: "/chat/tools", label: "Tools" },
  { href: "/chat/skills", label: "Skills" },
  { href: "/chat/models", label: "Models" },
  { href: "/chat/chatops", label: "ChatOps" },
];

export default function ChatTabs() {
  const path = usePathname();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)]">
      <h1 className="mr-4 flex-none text-lg font-semibold">Chat AI</h1>
      {TABS.map((t) => {
        const active = t.href === "/chat" ? path === "/chat" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative flex-none px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "text-[var(--color-fg)]" : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            }`}
          >
            {t.label}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-accent)]" />}
          </Link>
        );
      })}
    </div>
  );
}
