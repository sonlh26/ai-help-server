import ChatTabs from "@/components/chat/ChatTabs";

/** Chat AI section shell: sub-tab bar (Chat / Tools / Skills / Models / ChatOps)
    above the active sub-page, filling the viewport height. */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-col">
      <ChatTabs />
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </div>
  );
}
