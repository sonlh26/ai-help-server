import { headers } from "next/headers";
import { auth } from "./auth";

export type SessionUser = { id: string; email: string; name: string; role?: string | null };

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return (session?.user as SessionUser) ?? null;
}

/** Server-side call to the FastAPI api with internal auth + forwarded user identity. */
export async function callApi(path: string, user: SessionUser, init: RequestInit = {}): Promise<Response> {
  const base = process.env.API_BASE_URL || "http://api:8000";
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      "X-Internal-Token": process.env.INTERNAL_SERVICE_TOKEN || "",
      "X-User-Id": user.id,
      "X-User-Role": user.role || "viewer",
    },
    cache: "no-store",
  });
}
