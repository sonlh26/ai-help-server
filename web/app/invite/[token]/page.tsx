"use client";

import { signUp } from "@/lib/auth-client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface ValidateResp {
  valid: boolean;
  email?: string;
  role?: string;
  expiresAt?: string;
}

const STRENGTH = ["Rất yếu", "Yếu", "Trung bình", "Khá", "Mạnh"];
const STRENGTH_COLOR = ["#ff5d5d", "#ff5d5d", "#ffcc55", "#7ed957", "#21d07a"];

function scorePassword(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function EyeBtn({ on, toggle }: { on: boolean; toggle: () => void }) {
  return (
    <button
      type="button" onClick={toggle} aria-label={on ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)] hover:text-[var(--color-muted)]"
    >
      {on ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export default function InvitePage() {
  const router = useRouter();
  const token = useParams<{ token: string }>().token;

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ValidateResp | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    fetch(`/api/invite/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: ValidateResp) => setInfo(d))
      .catch(() => setInfo({ valid: false }))
      .finally(() => setLoading(false));
  }, [token]);

  // Live countdown tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const score = scorePassword(password);
  const match = confirm.length > 0 && confirm === password;
  const canSubmit = password.length >= 8 && match && !busy;

  const expiry = useMemo(() => {
    if (!info?.expiresAt) return null;
    const exp = new Date(info.expiresAt).getTime();
    const ms = exp - (now || Date.now());
    if (ms <= 0) return { expired: true, countdown: "00:00:00", date: "" };
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = new Date(exp);
    return {
      expired: false,
      countdown: `${pad(h)}:${pad(m)}:${pad(s)}`,
      date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    };
  }, [info, now]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!info?.email || !canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const { error: err } = await signUp.email({
        email: info.email, password, name: info.email.split("@")[0],
      });
      if (err) {
        setError(err.message || "Không thể tạo tài khoản.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Không thể hoàn tất. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full opacity-40 blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(33,208,122,0.35), transparent 70%)" }}
      />
      <div className="relative w-full max-w-md fade-up">
        <div className="card px-8 py-9 shadow-2xl shadow-black/50">
          <div className="mb-7 flex flex-col items-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 shadow-[0_0_32px_rgba(33,208,122,0.45)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 13V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9" /><path d="m2 7 10 6 10-6" />
              </svg>
            </span>
            <h1 className="text-xl font-bold tracking-tight">Thiết lập mật khẩu cho tài khoản mới</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Bạn đã được mời tham gia AI Help</p>
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">Đang kiểm tra lời mời…</p>
          ) : !info?.valid || expiry?.expired ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-3 text-sm text-[var(--color-danger)]">
                Lời mời không hợp lệ hoặc đã hết hạn.
              </div>
              <button className="btn btn-ghost w-full" onClick={() => router.push("/login")}>
                Về trang đăng nhập
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {/* invited email + role */}
              <div className="flex items-end justify-between rounded-lg border border-[var(--color-border,#1e2a23)] bg-black/20 px-4 py-3">
                <div className="min-w-0">
                  <div className="label mb-0.5">Email được mời</div>
                  <div className="truncate text-sm">{info.email}</div>
                </div>
                <div className="ml-3 text-right">
                  <div className="label mb-0.5">Vai trò</div>
                  <span className="pill" style={{ color: "var(--color-accent)" }}>{info.role}</span>
                </div>
              </div>

              {/* new password */}
              <div>
                <label className="label" htmlFor="pw">Mật khẩu mới</label>
                <div className="relative">
                  <input
                    id="pw" type={showPw ? "text" : "password"} className="input pr-10" value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 8 ký tự"
                    autoComplete="new-password" required
                  />
                  <EyeBtn on={showPw} toggle={() => setShowPw((s) => !s)} />
                </div>
                {password.length > 0 && (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex flex-1 gap-1.5">
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i} className="h-1.5 flex-1 rounded-full transition-colors"
                            style={{ background: i < score ? STRENGTH_COLOR[score] : "var(--color-border,#23332a)" }}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium" style={{ color: STRENGTH_COLOR[score] }}>
                        {STRENGTH[score]}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                      {score >= 4 ? "Mật khẩu mạnh. Hãy lưu mật khẩu ở nơi an toàn." : "Nên dùng chữ hoa, số và ký tự đặc biệt."}
                    </p>
                  </>
                )}
              </div>

              {/* confirm */}
              <div>
                <label className="label" htmlFor="confirm">Xác nhận mật khẩu</label>
                <div className="relative">
                  <input
                    id="confirm" type={showConfirm ? "text" : "password"} className="input pr-10" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} placeholder="Nhập lại mật khẩu"
                    autoComplete="new-password" required
                  />
                  <EyeBtn on={showConfirm} toggle={() => setShowConfirm((s) => !s)} />
                </div>
                {confirm.length > 0 && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: match ? "var(--color-accent)" : "var(--color-danger)" }}>
                    {match ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>
                    )}
                    {match ? "Mật khẩu khớp" : "Mật khẩu chưa khớp"}
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
                  {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full justify-center" disabled={!canSubmit}>
                {busy ? "Đang kích hoạt…" : "Kích hoạt tài khoản"}
              </button>

              {expiry && (
                <div className="border-t border-[var(--color-border,#1e2a23)] pt-4 text-center">
                  <p className="text-sm text-[var(--color-muted)]">
                    Liên kết này sẽ hết hạn sau{" "}
                    <span className="font-medium text-[var(--color-accent)]">{expiry.countdown}</span>{" "}
                    <span className="text-[var(--color-faint)]">{expiry.date}</span>
                  </p>
                  <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-[var(--color-faint)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Liên kết chỉ sử dụng một lần và sẽ hết hạn sau khi kích hoạt.
                  </p>
                </div>
              )}
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-[var(--color-faint)]">
          Gặp vấn đề? Liên hệ <span className="text-[var(--color-accent)]">quản trị viên</span> để được hỗ trợ.
        </p>
        <p className="mt-2 text-center text-xs text-[var(--color-faint)]">
          AI Help v1.0.0 • Chỉ dành cho người được mời
        </p>
      </div>
    </main>
  );
}
