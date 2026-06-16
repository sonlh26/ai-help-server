"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Shared building blocks for the admin / settings / alerts pages.
 * Pure Tailwind, reuses the global .card/.btn/.pill utilities.
 */

/* Relative-time helper (Vietnamese) ---------------------------------------- */
/** "Hôm nay 14:35", "Hôm qua 09:12", "12/06 08:00" + coarse "x phút trước". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  const hhmm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (diffMin < 1) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (sameDay) return `Hôm nay ${hhmm}`;
  if (isYesterday) return `Hôm qua ${hhmm}`;
  return `${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} ${hhmm}`;
}

/** Absolute date only (for table cells). */
export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* Page header -------------------------------------------------------------- */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-0.5 text-sm text-[var(--color-muted)]">{subtitle}</p>
    </div>
  );
}

/* Toast -------------------------------------------------------------------- */
export type ToastKind = "success" | "error";
export interface ToastState {
  message: string;
  kind: ToastKind;
}

/** Auto-dismissing toast, bottom-right. Caller controls visibility via state. */
export function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  const ok = toast.kind === "success";
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg fade-up"
      style={{
        background: ok ? "var(--color-accent-soft)" : "var(--color-danger-soft)",
        borderColor: ok ? "rgba(33,208,122,0.4)" : "#46211f",
        color: ok ? "var(--color-accent)" : "var(--color-danger)",
      }}
    >
      <span className="dot" />
      {toast.message}
    </div>
  );
}

/** Convenience hook: returns [toast, show(message, kind), clear]. */
export function useToast(): [ToastState | null, (m: string, k?: ToastKind) => void, () => void] {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = (message: string, kind: ToastKind = "success") => setToast({ message, kind });
  const clear = () => setToast(null);
  return [toast, show, clear];
}

/* Tabs (segmented) --------------------------------------------------------- */
export function SegTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--color-border)] bg-[#0e1412] p-1">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              on
                ? "bg-[var(--color-panel-2)] text-[var(--color-fg)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* Pagination --------------------------------------------------------------- */
export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--color-faint)]">
        Trang {page} / {pageCount}
      </span>
      <div className="flex items-center gap-2">
        <button
          className="btn btn-ghost px-3 py-1.5 text-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Trước
        </button>
        <button
          className="btn btn-ghost px-3 py-1.5 text-sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Sau
        </button>
      </div>
    </div>
  );
}

/* Confirmation modal ------------------------------------------------------- */
export function ConfirmCard({
  title,
  body,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-md p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{body}</div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Toggle switch ------------------------------------------------------------ */
export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-[var(--color-accent)]" : "bg-[#243029]"
      }`}
    >
      <span
        className="inline-block transform rounded-full bg-white transition-transform"
        style={{
          height: "1.125rem",
          width: "1.125rem",
          transform: checked ? "translateX(1.375rem)" : "translateX(0.25rem)",
        }}
      />
    </button>
  );
}

/* Role pill ---------------------------------------------------------------- */
export const ROLES = ["admin", "member", "viewer"] as const;
export const roleLabels: Record<string, string> = {
  admin: "Quản trị",
  member: "Thành viên",
  viewer: "Người xem",
};

export function RolePill({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <span className={`pill ${isAdmin ? "pill-on" : ""}`}>
      <span className="dot" />
      {roleLabels[role] ?? role}
    </span>
  );
}
