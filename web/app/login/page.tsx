"use client";

import { signIn } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(""); // clear error while submitting — never show error + spinner together
    try {
      const { error: err } = await signIn.email({ email, password });
      if (err) {
        setError(err.message || "Email hoặc mật khẩu không chính xác.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Không thể đăng nhập. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      {/* ambient green glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full opacity-40 blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(33,208,122,0.35), transparent 70%)" }}
      />

      <div className="relative w-full max-w-md fade-up">
        <div className="card px-8 py-9 shadow-2xl shadow-black/50">
          {/* brand */}
          <div className="mb-7 flex flex-col items-center text-center">
            <span
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 shadow-[0_0_32px_rgba(33,208,122,0.45)]"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 3 7v6c0 5 3.5 7.7 9 9 5.5-1.3 9-4 9-9V7l-9-5Z" />
                <path d="m13 9-3 4h4l-3 4" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-[var(--color-accent)]">AI</span> Help
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Quản lý server với trợ lý AI</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#46211f] bg-[var(--color-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-danger)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
                  </svg>
                </span>
                <input
                  id="email" type="email" className="input pl-9" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                  autoComplete="email" required autoFocus
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">Mật khẩu</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="password" type={showPw ? "text" : "password"} className="input pl-9 pr-10" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  autoComplete="current-password" required
                />
                <button
                  type="button" onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-faint)] hover:text-[var(--color-muted)]"
                >
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="text-sm">
              <button type="button" onClick={() => setHint((h) => !h)} className="text-[var(--color-accent)] hover:underline">
                Quên mật khẩu?
              </button>
              {hint && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Hệ thống dùng cơ chế mời. Vui lòng liên hệ quản trị viên để đặt lại mật khẩu.
                </p>
              )}
            </div>

            <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
                  </svg>
                  Đang đăng nhập…
                </span>
              ) : (
                "Đăng nhập"
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-[var(--color-border,#1e2a23)] pt-4 text-center text-xs text-[var(--color-faint)]">
            v1.0.0 • Chỉ dành cho người được mời
          </div>
        </div>
      </div>
    </main>
  );
}
