import { callApi, getSessionUser } from "@/lib/api";
import { NextRequest } from "next/server";

// Authenticated proxy: web client -> this route -> FastAPI api (internal token + user identity).
// Streams the response body through (SSE for chat works transparently).
async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const user = await getSessionUser();
  if (!user) return new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 });

  const { path } = await ctx.params;
  const search = new URL(req.url).search;
  const target = "/" + path.join("/") + search;

  const init: RequestInit = { method: req.method };
  if (!["GET", "HEAD"].includes(req.method)) {
    init.body = await req.text();
  }

  const res = await callApi(target, user, init);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
      "Cache-Control": "no-cache",
    },
  });
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
