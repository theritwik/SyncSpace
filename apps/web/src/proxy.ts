import { SESSION_COOKIE_NAME } from "@syncspace/shared";
import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/config/env";

/**
 * Runs before matched requests reach a route (Next.js "Proxy", formerly Middleware).
 *
 * 1. `/api/v1/*` is forwarded to the API. The browser therefore only ever
 *    talks to the web app's own origin, which makes the session cookie a
 *    first-party cookie and removes the need for CORS.
 * 2. Protected pages get an optimistic check: without a session cookie there
 *    is no point rendering the page, so redirect straight away. This is a
 *    convenience only. The real check (is the session valid?) happens on the
 *    server in `getCurrentUser`, and the API authorises every request itself.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/v1/")) {
    return NextResponse.rewrite(new URL(pathname + search, getServerEnv().API_URL));
  }

  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/v1/:path*", "/account/:path*"],
};
