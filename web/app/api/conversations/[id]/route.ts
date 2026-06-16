import { getSessionUser } from "@/lib/api";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

// Get one conversation with its full message thread (owner-scoped).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser();
  if (!u) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const row = (
    await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, u.id)))
      .limit(1)
  )[0];
  if (!row) return Response.json({ detail: "Not found" }, { status: 404 });
  return Response.json(row);
}

// Upsert: create on first save, update thereafter. The conflict update is guarded
// by user_id so a guessed id can never overwrite another user's conversation.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser();
  if (!u) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const title = (typeof body.title === "string" && body.title.trim() ? body.title : "Hội thoại mới").slice(0, 120);
  const serverId = typeof body.serverId === "string" ? body.serverId : null;
  const messages = Array.isArray(body.messages) ? body.messages : [];

  await db
    .insert(conversations)
    .values({ id, userId: u.id, title, serverId, messages, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: conversations.id,
      set: { title, serverId, messages, updatedAt: new Date() },
      where: eq(conversations.userId, u.id),
    });
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser();
  if (!u) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, u.id)));
  return Response.json({ ok: true });
}
