import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

// Optimistic gate (cookie presence). Real authorization is enforced server-side
// in the proxy + FastAPI api on every request.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/api/auth");
  const cookie = getSessionCookie(req);
  if (!cookie && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (cookie && pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
