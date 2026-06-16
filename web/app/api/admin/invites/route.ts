import { getSessionUser } from "@/lib/api";
import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { createInvite } from "@/lib/invites";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const rows = await db.select().from(invites).orderBy(desc(invites.createdAt)).limit(100);
  // Never expose token hashes.
  return Response.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      expiresAt: r.expiresAt,
      acceptedAt: r.acceptedAt,
      createdAt: r.createdAt,
    })),
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const role = ["admin", "member", "viewer"].includes(body.role) ? body.role : "member";
  if (!email || !email.includes("@")) {
    return Response.json({ detail: "Email không hợp lệ." }, { status: 400 });
  }
  const token = await createInvite(email, role, admin.id);
  const base = process.env.BETTER_AUTH_URL || "";
  // Return only the URL (contains the token once); never echo the bare token field.
  return Response.json({ ok: true, email, role, url: `${base}/invite/${token}` });
}
