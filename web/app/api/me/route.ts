import { getSessionUser } from "@/lib/api";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role || "member" },
  });
}
