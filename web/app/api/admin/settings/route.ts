import { getSessionUser } from "@/lib/api";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const MASK = "********";

async function requireAdmin() {
  const u = await getSessionUser();
  return u && u.role === "admin" ? u : null;
}

async function read(): Promise<Record<string, any>> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, "global")).limit(1);
  return (rows[0]?.data as Record<string, any>) || {};
}

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const data = await read();
  const llm = { ...(data.llm || {}) };
  const apiKeySet = !!llm.api_key;
  delete llm.api_key; // never expose the key

  // Mask Telegram bot token (lives in notify, shared with ChatOps).
  const notify = { ...(data.notify || {}) };
  const tgTokenSet = !!notify.telegram_bot_token;
  delete notify.telegram_bot_token;

  // Mask the webhook secret.
  const chatops = { ...(data.chatops || {}) };
  const webhookSecretSet = !!chatops.telegram_webhook_secret;
  delete chatops.telegram_webhook_secret;

  return Response.json({
    llm: { ...llm, api_key_set: apiKeySet },
    notify: { ...notify, telegram_bot_token_set: tgTokenSet },
    chatops: { ...chatops, telegram_webhook_secret_set: webhookSecretSet },
  });
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return Response.json({ detail: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const current = await read();

  const llm = { ...(current.llm || {}), ...(body.llm || {}) };
  // Keep existing api_key when the client sends blank/mask (avoids wiping the secret).
  const incomingKey = body.llm?.api_key;
  if (incomingKey === undefined || incomingKey === "" || incomingKey === MASK) {
    if (current.llm?.api_key) llm.api_key = current.llm.api_key;
    else delete llm.api_key;
  }
  const notify = { ...(current.notify || {}), ...(body.notify || {}) };
  // Keep existing Telegram bot token when blank/mask.
  const inTok = body.notify?.telegram_bot_token;
  if (inTok === undefined || inTok === "" || inTok === MASK) {
    if (current.notify?.telegram_bot_token) notify.telegram_bot_token = current.notify.telegram_bot_token;
    else delete notify.telegram_bot_token;
  }

  const chatops = { ...(current.chatops || {}), ...(body.chatops || {}) };
  const inSecret = body.chatops?.telegram_webhook_secret;
  if (inSecret === undefined || inSecret === "" || inSecret === MASK) {
    if (current.chatops?.telegram_webhook_secret) chatops.telegram_webhook_secret = current.chatops.telegram_webhook_secret;
    else delete chatops.telegram_webhook_secret;
  }

  const data = { ...current, llm, notify, chatops };

  await db
    .insert(appSettings)
    .values({ id: "global", data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.id, set: { data, updatedAt: new Date() } });

  return Response.json({ ok: true });
}
