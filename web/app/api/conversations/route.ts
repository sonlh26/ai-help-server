import { getSessionUser } from "@/lib/api";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

// List the current user's saved conversations (metadata only — no message bodies).
export async function GET() {
  const u = await getSessionUser();
  if (!u) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      serverId: conversations.serverId,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, u.id))
    .orderBy(desc(conversations.updatedAt))
    .limit(100);
  return Response.json(rows);
}
