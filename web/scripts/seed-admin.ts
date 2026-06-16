/**
 * Seed the first admin (invite-only bootstrap).
 * Idempotent: if an admin already exists, does nothing.
 * Run after `db:push`: `npm run seed:admin`.
 */
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user } from "../lib/db/schema";
import { createInvite } from "../lib/invites";

async function main() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || "").toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || "";
  if (!email || !password) {
    console.error("Thiếu INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD.");
    process.exit(1);
  }

  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing.length) {
    console.log(`Admin ${email} đã tồn tại — bỏ qua seed.`);
    process.exit(0);
  }

  // Create an admin invite, then sign up (the create.before hook consumes it + sets role).
  await createInvite(email, "admin", null);
  await auth.api.signUpEmail({
    body: { email, password, name: "Administrator" },
  });
  console.log(`Đã tạo admin: ${email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
