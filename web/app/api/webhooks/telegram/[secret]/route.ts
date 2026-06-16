import { NextRequest } from "next/server";

// PUBLIC endpoint (no session) that Telegram calls. It forwards the update to the
// internal FastAPI api, which verifies the path `secret`. The api is not publicly
// reachable, so this proxy is the only public surface.
export async function POST(req: NextRequest, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const base = process.env.API_BASE_URL || "http://api:8000";
  const body = await req.text();
  try {
    const res = await fetch(`${base}/chatops/telegram/webhook/${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.INTERNAL_SERVICE_TOKEN || "",
      },
      body,
      cache: "no-store",
    });
    return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch {
    // Always 200 so Telegram doesn't hammer retries on transient errors.
    return Response.json({ ok: false }, { status: 200 });
  }
}
