import { getSessionUser } from "@/lib/api";
import { db } from "@/lib/db";
import { session, user } from "@/lib/db/schema";
import { desc, eq, max } from "drizzle-orm";
import { NextRequest } from "next/server";

async function requireAdmin() {
  const u = await getSessionUser();
  if (!u || u.role !== "admin") return null;
  return u;
}

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const rows = await db
    .select({ id: user.id, email: user.email, name: user.name, role: user.role, banned: user.banned, createdAt: user.createdAt })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(200);
  // Last login ≈ most recent session per user.
  const last = await db
    .select({ userId: session.userId, lastLogin: max(session.createdAt) })
    .from(session)
    .groupBy(session.userId);
  const lastMap = new Map(last.map((r) => [r.userId, r.lastLogin]));
  return Response.json(rows.map((r) => ({ ...r, lastLogin: lastMap.get(r.id) ?? null })));
}

async function adminCount(): Promise<number> {
  const r = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
  return r.length;
}

// Edit a user: role (admin|member|viewer), display name, and/or ban status.
// Body: { userId, role?, name?, banned? }
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { userId, role, name, banned, email } = body;
  if (!userId) return Response.json({ detail: "Thiếu userId." }, { status: 400 });

  const target = (await db.select().from(user).where(eq(user.id, userId)).limit(1))[0];
  if (!target) return Response.json({ detail: "Không tìm thấy người dùng." }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (typeof email === "string" && email.trim() && email.trim().toLowerCase() !== target.email) {
    const next = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      return Response.json({ detail: "Email không hợp lệ." }, { status: 400 });
    }
    const taken = (await db.select({ id: user.id }).from(user).where(eq(user.email, next)).limit(1))[0];
    if (taken && taken.id !== userId) {
      return Response.json({ detail: "Email đã được dùng bởi tài khoản khác." }, { status: 400 });
    }
    patch.email = next;
  }

  if (role !== undefined) {
    if (!["admin", "member", "viewer"].includes(role)) {
      return Response.json({ detail: "Vai trò không hợp lệ." }, { status: 400 });
    }
    if (userId === admin.id && role !== "admin") {
      return Response.json({ detail: "Không thể tự hạ quyền chính mình." }, { status: 400 });
    }
    // Don't allow demoting the last admin.
    if (target.role === "admin" && role !== "admin" && (await adminCount()) <= 1) {
      return Response.json({ detail: "Không thể hạ quyền admin cuối cùng." }, { status: 400 });
    }
    patch.role = role;
  }

  if (typeof name === "string" && name.trim()) patch.name = name.trim();

  if (banned !== undefined) {
    if (userId === admin.id) {
      return Response.json({ detail: "Không thể tự khóa chính mình." }, { status: 400 });
    }
    patch.banned = !!banned;
    if (banned) {
      // Force logout: drop all sessions of the banned user.
      await db.delete(session).where(eq(session.userId, userId));
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ detail: "Không có thay đổi." }, { status: 400 });
  }
  await db.update(user).set(patch).where(eq(user.id, userId));
  return Response.json({ ok: true });
}
