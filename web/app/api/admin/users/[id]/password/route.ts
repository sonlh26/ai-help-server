import { getSessionUser } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

// Admin reset of a user's password (Better Auth admin plugin setUserPassword).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getSessionUser();
  if (!admin || admin.role !== "admin") return Response.json({ detail: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const newPassword = body.newPassword || "";
  if (newPassword.length < 6) {
    return Response.json({ detail: "Mật khẩu phải có ít nhất 6 ký tự." }, { status: 400 });
  }
  try {
    await auth.api.setUserPassword({
      body: { newPassword, userId: id },
      headers: await headers(),
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ detail: "Không đặt lại được mật khẩu." }, { status: 400 });
  }
}
