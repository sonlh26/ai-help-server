import { getValidInviteByToken } from "@/lib/invites";
import { NextRequest } from "next/server";

// Public: validate an invite token (used by the invite-accept page to prefill email).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const invite = await getValidInviteByToken(token);
  if (!invite) {
    return Response.json({ valid: false });
  }
  return Response.json({
    valid: true,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  });
}
