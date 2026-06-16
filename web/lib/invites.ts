import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./db";
import { invites } from "./db/schema";

const TTL_MS = 7 * 24 * 3600 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create an invite; returns the raw token (show/email once, never stored in plaintext). */
export async function createInvite(email: string, role: string, invitedBy: string | null): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.insert(invites).values({
    id: randomBytes(8).toString("hex"),
    email: email.toLowerCase(),
    role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TTL_MS),
    invitedBy,
  });
  return token;
}

/** Valid = matching hash, not accepted, not expired. Returns invite row or null. */
export async function getValidInviteByToken(token: string) {
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function getValidInviteByEmail(email: string) {
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.email, email.toLowerCase()), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function markInviteAccepted(email: string) {
  await db
    .update(invites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(invites.email, email.toLowerCase()), isNull(invites.acceptedAt)));
}
