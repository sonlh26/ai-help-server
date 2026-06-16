"use client";

import { IconDots, IconRefresh } from "@/components/server/icons";
import { IconPlus } from "@/components/shell/icons";
import {
  ConfirmCard,
  PageHeader,
  Pagination,
  ROLES,
  RolePill,
  SegTabs,
  Toast,
  Toggle,
  dateOnly,
  relativeTime,
  roleLabels,
  useToast,
  type ToastKind,
} from "@/components/admin/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* Types -------------------------------------------------------------------- */
interface Me {
  authenticated: boolean;
  user?: { id: string; email: string; name: string; role: string };
}
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  banned?: boolean | null;
  createdAt?: string | null;
  lastLogin?: string | null;
}
interface InviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  createdAt: string | null;
}

const PAGE_SIZE = 10;

/* Copyable URL banner ------------------------------------------------------ */
function UrlBanner({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="mt-3 rounded-lg border border-[rgba(33,208,122,0.3)] bg-[var(--color-accent-soft)] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--color-accent)]">
          Liên kết mời (gửi cho người dùng):
        </p>
        <button
          className="text-xs text-[var(--color-faint)] hover:text-[var(--color-fg)]"
          onClick={onClose}
        >
          Đóng
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input className="input flex-1 text-xs" value={url} readOnly />
        <button className="btn btn-ghost px-3 py-2 text-sm" onClick={copy}>
          {copied ? "Đã chép" : "Chép"}
        </button>
      </div>
    </div>
  );
}

/* Invite modal ------------------------------------------------------------- */
function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (url: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.detail || "Không thể tạo lời mời.");
        return;
      }
      onCreated(d.url || "");
      onClose();
    } catch {
      setErr("Lỗi kết nối.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <form
        className="card w-full max-w-md p-6 fade-up"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-lg font-semibold">Mời người dùng</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nguoidung@congty.com"
              required
            />
          </div>
          <div>
            <label className="label">Vai trò</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </div>
          {err && (
            <p className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {err}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo lời mời"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* Kebab menu --------------------------------------------------------------- */
interface KebabItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

const KEBAB_MENU_WIDTH = 176; // w-44 (11rem)

function Kebab({ items }: { items: KebabItem[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the portalled menu next to the trigger, right-aligned, flipping
  // upward when it would overflow the bottom of the viewport.
  const reposition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? items.length * 40 + 8;
    const gap = 4;

    let top = r.bottom + gap;
    if (top + menuH > window.innerHeight - 8) {
      top = Math.max(8, r.top - gap - menuH); // flip upward
    }
    let left = r.right - KEBAB_MENU_WIDTH; // align to button's right edge
    if (left < 8) left = 8;
    setCoords({ top, left });
  }, [items.length]);

  // Recompute on open; keep aligned on scroll/resize while open.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  // Click-outside + Esc to close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-fg)]"
        onClick={() => setOpen((o) => !o)}
        aria-label="Thao tác"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <IconDots className="h-4 w-4" />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="card fixed z-[70] w-44 overflow-hidden p-1 shadow-lg fade-up"
            style={{ top: coords?.top ?? -9999, left: coords?.left ?? -9999 }}
          >
            {items.map((it, i) => (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                title={it.title}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent hover:bg-[var(--color-panel-2)] ${
                  it.danger ? "text-[var(--color-danger)]" : "text-[var(--color-fg)]"
                }`}
                onClick={() => {
                  if (it.disabled) return;
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/* Edit user modal ---------------------------------------------------------- */
function EditUserModal({
  user,
  self,
  onClose,
  onSaved,
  toast,
}: {
  user: UserRow;
  self: boolean;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string, k?: ToastKind) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [role, setRole] = useState(user.role);
  const [banned, setBanned] = useState(!!user.banned);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Reset-password section (independent from the main save).
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");

  // Self-row guard: cannot demote self from admin, cannot ban self.
  const demotingSelf = self && user.role === "admin" && role !== "admin";
  const banningSelf = self && banned;
  const emailChanged = email.trim() !== (user.email ?? "");
  const dirty =
    name.trim() !== (user.name ?? "") ||
    emailChanged ||
    role !== user.role ||
    banned !== !!user.banned;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) {
      onClose();
      return;
    }
    setBusy(true);
    setErr("");

    // Build payload with only changed fields.
    const body: {
      userId: string;
      name?: string;
      email?: string;
      role?: string;
      banned?: boolean;
    } = { userId: user.id };
    if (name.trim() !== (user.name ?? "")) body.name = name.trim();
    if (emailChanged) body.email = email.trim();
    if (role !== user.role) body.role = role;
    if (banned !== !!user.banned) body.banned = banned;

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.detail || "Không thể cập nhật người dùng.");
        return;
      }
      toast("Đã cập nhật thông tin người dùng.");
      onSaved();
      onClose();
    } catch {
      setErr("Lỗi kết nối.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setPwErr("");
    if (pw.length < 6) {
      setPwErr("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }
    if (pw !== pwConfirm) {
      setPwErr("Mật khẩu xác nhận không khớp.");
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pw }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwErr(d.detail || "Không đặt lại được mật khẩu.");
        return;
      }
      toast("Đã đặt lại mật khẩu.");
      setPw("");
      setPwConfirm("");
      setPwOpen(false);
    } catch {
      setPwErr("Lỗi kết nối.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <form
        className="card w-full max-w-md p-6 fade-up"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-lg font-semibold">Sửa thông tin người dùng</h2>
        <p className="mt-0.5 text-xs text-[var(--color-faint)]">{user.email}</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nguoidung@congty.com"
            />
          </div>
          <div>
            <label className="label">Tên hiển thị</label>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên người dùng"
            />
          </div>
          <div>
            <label className="label">Vai trò</label>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
            {demotingSelf && (
              <p className="mt-1 text-xs text-[var(--color-warn)]">
                Không thể tự hạ quyền chính mình.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[#0e1412] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Trạng thái tài khoản</p>
              <p className="text-xs text-[var(--color-faint)]">
                {banned ? "Đã khóa — người dùng bị đăng xuất." : "Đang hoạt động."}
              </p>
            </div>
            <Toggle
              checked={!banned}
              onChange={(active) => setBanned(!active)}
              disabled={self}
            />
          </div>
          {banningSelf && (
            <p className="text-xs text-[var(--color-warn)]">Không thể tự khóa chính mình.</p>
          )}

          {/* Reset password section — independent from the main save flow. */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[#0e1412] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Đặt lại mật khẩu</p>
                <p className="text-xs text-[var(--color-faint)]">
                  Tạo mật khẩu mới cho người dùng này.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-sm"
                onClick={() => {
                  setPwOpen((o) => !o);
                  setPwErr("");
                }}
              >
                {pwOpen ? "Đóng" : "Đặt lại"}
              </button>
            </div>
            {pwOpen && (
              <div className="mt-3 space-y-2.5">
                <div>
                  <label className="label">Mật khẩu mới</label>
                  <input
                    className="input"
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="label">Xác nhận mật khẩu</label>
                  <input
                    className="input"
                    type="password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    autoComplete="new-password"
                  />
                </div>
                {pwErr && (
                  <p className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
                    {pwErr}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-primary w-full py-1.5 text-sm"
                  onClick={resetPassword}
                  disabled={pwBusy || pw.length < 6 || pw !== pwConfirm}
                >
                  {pwBusy ? "Đang đặt lại…" : "Đặt lại mật khẩu"}
                </button>
              </div>
            )}
          </div>

          {err && (
            <p className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {err}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !dirty || demotingSelf || banningSelf}
          >
            {busy ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* Users tab ---------------------------------------------------------------- */
function UsersTab({
  meId,
  toast,
}: {
  meId: string;
  toast: (m: string, k?: ToastKind) => void;
}) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ user: UserRow; role: string } | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [banConfirm, setBanConfirm] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  const load = useCallback(() => {
    setError("");
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => {
        setUsers([]);
        setError("Không thể tải danh sách người dùng.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmRole() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pending.user.id, role: pending.role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(d.detail || "Không thể thay đổi vai trò.", "error");
      } else {
        toast("Đã cập nhật vai trò người dùng.");
        load();
      }
    } catch {
      toast("Lỗi kết nối.", "error");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  // Quick ban/unban toggle. Confirm is only required when locking.
  async function setBanned(user: UserRow, value: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, banned: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(d.detail || "Không thể cập nhật trạng thái.", "error");
      } else {
        toast(value ? "Đã khóa người dùng." : "Đã mở khóa người dùng.");
        load();
      }
    } catch {
      toast("Lỗi kết nối.", "error");
    } finally {
      setBusy(false);
      setBanConfirm(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(d.detail || "Không thể xóa người dùng.", "error");
      } else {
        toast("Đã xóa người dùng.");
        load();
      }
    } catch {
      toast("Lỗi kết nối.", "error");
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  const list = users ?? [];
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--color-faint)]">
          {users === null ? "Đang tải…" : `${list.length} người dùng`}
        </span>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost py-2 text-sm" onClick={load}>
            <IconRefresh className="h-4 w-4" />
            Làm mới
          </button>
          <button className="btn btn-primary py-2 text-sm" onClick={() => setShowInvite(true)}>
            <IconPlus className="h-4 w-4" />
            Mời người dùng
          </button>
        </div>
      </div>

      {newUrl && <UrlBanner url={newUrl} onClose={() => setNewUrl("")} />}

      {error ? (
        <div className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : users === null ? (
        <div className="card p-10 text-center text-sm text-[var(--color-muted)]">Đang tải…</div>
      ) : list.length === 0 ? (
        <div className="card p-12 text-center text-sm text-[var(--color-muted)]">
          Chưa có người dùng nào.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Vai trò</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium">Ngày tạo</th>
                  <th className="px-4 py-3 font-medium">Đăng nhập gần nhất</th>
                  <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u) => {
                  const self = u.id === meId;
                  const active = !u.banned;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--color-border-soft)] last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {u.email}
                          {self && (
                            <span className="ml-1.5 text-xs text-[var(--color-accent)]">(bạn)</span>
                          )}
                        </div>
                        {u.name && (
                          <div className="text-xs text-[var(--color-faint)]">{u.name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="input w-auto py-1.5 text-sm"
                          value={u.role}
                          disabled={self}
                          onChange={(e) => {
                            if (e.target.value !== u.role)
                              setPending({ user: u, role: e.target.value });
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabels[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`pill ${active ? "pill-on" : "pill-down"}`}>
                          <span className="dot" />
                          {active ? "Active" : "Đã khóa"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {dateOnly(u.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {u.lastLogin ? relativeTime(u.lastLogin) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end">
                          <Kebab
                            items={[
                              {
                                label: "Sửa thông tin",
                                onClick: () => setEditing(u),
                              },
                              {
                                label: "Sao chép email",
                                onClick: () => {
                                  navigator.clipboard?.writeText(u.email).catch(() => {});
                                  toast("Đã sao chép email.");
                                },
                              },
                              active
                                ? {
                                    label: "Khóa",
                                    disabled: self,
                                    title: self ? "Không thể tự khóa chính mình." : undefined,
                                    onClick: () => setBanConfirm(u),
                                  }
                                : {
                                    label: "Mở khóa",
                                    onClick: () => setBanned(u, false),
                                  },
                              {
                                label: "Xóa người dùng",
                                danger: true,
                                disabled: self,
                                title: self ? "Không thể tự xóa chính mình." : undefined,
                                onClick: () => setDeleting(u),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      {/* Role change confirmation */}
      {pending && (
        <ConfirmCard
          title="Thay đổi vai trò người dùng"
          body={
            <>
              Bạn đang thay đổi vai trò của <strong>{pending.user.email}</strong> từ{" "}
              <strong>{roleLabels[pending.user.role] ?? pending.user.role}</strong> thành{" "}
              <strong>{roleLabels[pending.role] ?? pending.role}</strong>. Hành động này có thể ảnh
              hưởng đến quyền truy cập hệ thống.
            </>
          }
          busy={busy}
          onConfirm={confirmRole}
          onCancel={() => setPending(null)}
        />
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={(url) => {
            setNewUrl(url);
            toast("Đã tạo lời mời.");
          }}
        />
      )}

      {/* Edit user modal */}
      {editing && (
        <EditUserModal
          user={editing}
          self={editing.id === meId}
          onClose={() => setEditing(null)}
          onSaved={load}
          toast={toast}
        />
      )}

      {/* Lock (ban) confirmation */}
      {banConfirm && (
        <ConfirmCard
          title="Khóa người dùng"
          body={
            <>
              Khóa tài khoản <strong>{banConfirm.email}</strong>? Người dùng sẽ bị đăng xuất ngay
              lập tức và không thể đăng nhập lại cho tới khi được mở khóa.
            </>
          }
          danger
          confirmLabel="Khóa"
          busy={busy}
          onConfirm={() => setBanned(banConfirm, true)}
          onCancel={() => setBanConfirm(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <ConfirmCard
          title="Xóa người dùng"
          body={
            <>
              Xóa người dùng <strong>{deleting.email}</strong>? Hành động không thể hoàn tác. Mọi
              server của họ cũng bị xóa.
            </>
          }
          danger
          confirmLabel="Xóa"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/* Invites tab -------------------------------------------------------------- */
function InviteStatusPill({ inv }: { inv: InviteRow }) {
  if (inv.acceptedAt) {
    return (
      <span className="pill pill-on">
        <span className="dot" />
        Đã chấp nhận
      </span>
    );
  }
  const expired = inv.expiresAt ? new Date(inv.expiresAt) < new Date() : false;
  if (expired) {
    return (
      <span className="pill pill-down">
        <span className="dot" />
        Hết hạn
      </span>
    );
  }
  return (
    <span
      className="pill"
      style={{ color: "var(--color-warn)", borderColor: "#3a2f10", background: "var(--color-warn-soft)" }}
    >
      <span className="dot" />
      Đang chờ
    </span>
  );
}

function InvitesTab({ toast }: { toast: (m: string, k?: ToastKind) => void }) {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [newUrl, setNewUrl] = useState("");
  const [revoking, setRevoking] = useState<InviteRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    fetch("/api/admin/invites")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInvites(Array.isArray(d) ? d : []))
      .catch(() => {
        setInvites([]);
        setError("Không thể tải danh sách lời mời.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resend(inv: InviteRow) {
    try {
      const res = await fetch(`/api/admin/invites/${inv.id}`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(d.detail || "Không thể gửi lại.", "error");
        return;
      }
      setNewUrl(d.url || "");
      toast("Đã tạo liên kết mời mới.");
      load();
    } catch {
      toast("Lỗi kết nối.", "error");
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/invites/${revoking.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Không thể thu hồi lời mời.", "error");
      } else {
        toast("Đã thu hồi lời mời.");
        load();
      }
    } catch {
      toast("Lỗi kết nối.", "error");
    } finally {
      setBusy(false);
      setRevoking(null);
    }
  }

  const list = invites ?? [];
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--color-faint)]">
          {invites === null ? "Đang tải…" : `${list.length} lời mời`}
        </span>
        <button className="btn btn-ghost py-2 text-sm" onClick={load}>
          <IconRefresh className="h-4 w-4" />
          Làm mới
        </button>
      </div>

      {newUrl && <UrlBanner url={newUrl} onClose={() => setNewUrl("")} />}

      {error ? (
        <div className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : invites === null ? (
        <div className="card p-10 text-center text-sm text-[var(--color-muted)]">Đang tải…</div>
      ) : list.length === 0 ? (
        <div className="card p-12 text-center text-sm text-[var(--color-muted)]">
          Chưa có lời mời nào.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Vai trò</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium">Hết hạn</th>
                  <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((inv) => {
                  const accepted = !!inv.acceptedAt;
                  const expired = inv.expiresAt ? new Date(inv.expiresAt) < new Date() : false;
                  const canAct = !accepted;
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-[var(--color-border-soft)] last:border-0"
                    >
                      <td className="px-4 py-3 font-medium">{inv.email}</td>
                      <td className="px-4 py-3">
                        <RolePill role={inv.role} />
                      </td>
                      <td className="px-4 py-3">
                        <InviteStatusPill inv={inv} />
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {expired ? (
                          <span className="text-[var(--color-danger)]">{dateOnly(inv.expiresAt)}</span>
                        ) : (
                          dateOnly(inv.expiresAt)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canAct ? (
                          <div className="flex justify-end gap-2">
                            <button
                              className="btn btn-ghost px-3 py-1.5 text-sm"
                              onClick={() => resend(inv)}
                            >
                              Gửi lại
                            </button>
                            <button
                              className="btn btn-danger px-3 py-1.5 text-sm"
                              onClick={() => setRevoking(inv)}
                            >
                              Thu hồi
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--color-faint)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      {revoking && (
        <ConfirmCard
          title="Thu hồi lời mời"
          body={
            <>
              Bạn có chắc muốn thu hồi lời mời gửi tới <strong>{revoking.email}</strong>? Liên kết
              hiện tại sẽ không còn hiệu lực.
            </>
          }
          danger
          confirmLabel="Thu hồi"
          busy={busy}
          onConfirm={confirmRevoke}
          onCancel={() => setRevoking(null)}
        />
      )}
    </>
  );
}

/* Page --------------------------------------------------------------------- */
export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState("users");
  const [toast, showToast, clearToast] = useToast();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then(setMe)
      .catch(() => setMe({ authenticated: false }));
  }, []);

  const isAdmin = me?.user?.role === "admin";

  if (me === null) {
    return <p className="text-sm text-[var(--color-muted)]">Đang tải…</p>;
  }
  if (!isAdmin) {
    return (
      <div className="card p-10 text-center">
        <h1 className="text-lg font-semibold">Không có quyền</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Trang quản trị chỉ dành cho quản trị viên.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Quản lý người dùng & lời mời"
        subtitle="Mời thành viên, phân quyền và quản lý truy cập hệ thống."
      />

      <div className="mt-6">
        <SegTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "users", label: "Người dùng" },
            { key: "invites", label: "Lời mời" },
          ]}
        />
      </div>

      <div className="mt-5">
        {tab === "users" ? (
          <UsersTab meId={me.user!.id} toast={showToast} />
        ) : (
          <InvitesTab toast={showToast} />
        )}
      </div>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
