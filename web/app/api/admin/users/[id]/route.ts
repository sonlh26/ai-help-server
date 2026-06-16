import { getSessionUser } from "@/lib/api";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

async function requireAdmin() {
  const u = await getSessionUser();
  return u && u.role === "admin" ? u : null;
}

// Delete a user (cascades to their servers/sessions via FK). Blocks self + last admin.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  if (id === admin.id) {
    return Response.json({ detail: "Không thể tự xóa chính mình." }, { status: 400 });
  }
  const target = (await db.select().from(user).where(eq(user.id, id)).limit(1))[0];
  if (!target) return Response.json({ detail: "Không tìm thấy người dùng." }, { status: 404 });

  if (target.role === "admin") {
    const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
    if (admins.length <= 1) {
      return Response.json({ detail: "Không thể xóa admin cuối cùng." }, { status: 400 });
    }
  }
  await db.delete(user).where(eq(user.id, id));
  return Response.json({ ok: true });
}
