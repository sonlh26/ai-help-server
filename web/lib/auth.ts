import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./db/schema";
import { getValidInviteByEmail, markInviteAccepted } from "./invites";

// Invite-only: public sign-up is allowed by Better Auth ONLY when a valid invite exists
// for the email (enforced in the create.before hook). The login UI exposes no sign-up form.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [admin({ defaultRole: "member", adminRoles: ["admin"] })],
  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          const invite = await getValidInviteByEmail(userData.email);
          if (!invite) {
            throw new APIError("FORBIDDEN", { message: "Cần lời mời hợp lệ để đăng ký tài khoản." });
          }
          // Assign role from the invite.
          return { data: { ...userData, role: invite.role } };
        },
        after: async (userData) => {
          await markInviteAccepted(userData.email);
        },
      },
    },
  },
});
