import { getSessionUser } from "@/lib/api";
import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { hashToken } from "@/lib/invites";
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { NextRequest } from "next/server";

const TTL_MS = 7 * 24 * 3600 * 1000;

async function requireAdmin() {
  const u = await getSessionUser();
  return u && u.role === "admin" ? u : null;
}

// Revoke (delete) a pending invite.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  await db.delete(invites).where(and(eq(invites.id, id), isNull(invites.acceptedAt)));
  return Response.json({ ok: true });
}

// Resend: regenerate token + extend expiry; returns a fresh invite URL.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const rows = await db.select().from(invites).where(eq(invites.id, id)).limit(1);
  const inv = rows[0];
  if (!inv) return Response.json({ detail: "Không tìm thấy lời mời." }, { status: 404 });
  if (inv.acceptedAt) return Response.json({ detail: "Lời mời đã được dùng." }, { status: 400 });

  const token = randomBytes(24).toString("base64url");
  await db
    .update(invites)
    .set({ tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS) })
    .where(eq(invites.id, id));

  const base = process.env.BETTER_AUTH_URL || "";
  return Response.json({ ok: true, url: `${base}/invite/${token}` });
}
