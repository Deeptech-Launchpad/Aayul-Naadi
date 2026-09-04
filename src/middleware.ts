import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "aayu_session";

const PUBLIC_PREFIXES = ["/signin", "/signup", "/share/", "/icon.svg", "/manifest.webmanifest", "/robots.txt"];

/**
 * Content-Security-Policy and HSTS are set here rather than in `next.config.ts`,
 * because Next bakes `headers()` in at build time and both depend on how the app
 * is actually being served: `upgrade-insecure-requests` and HSTS are right behind
 * Caddy and actively wrong on the deliberate plain-HTTP LAN setup, which the same
 * image has to support.
 *
 * The decision is made from the request rather than from an environment variable,
 * because middleware runs in the Edge runtime where `process.env` is inlined at
 * build time — a variable read here would be frozen to whatever the build saw.
 * `NODE_ENV` is the exception: it is genuinely fixed at build time.
 */
function securityPolicy(overHttps: boolean): Array<[string, string]> {
  const csp = [
    "default-src 'self'",
    process.env.NODE_ENV === "production"
      ? "script-src 'self' 'unsafe-inline'"
      : // React's development build needs eval(); the production build never does.
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    process.env.NODE_ENV === "production" ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    overHttps ? "upgrade-insecure-requests" : "",
  ].filter(Boolean);

  const headers: Array<[string, string]> = [["Content-Security-Policy", csp.join("; ")]];
  if (overHttps) {
    headers.push(["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"]);
  }
  return headers;
}

/**
 * A cheap first gate: no session cookie means no reason to render an app page.
 * The real check — is this session valid, has it passed two-factor, is the app
 * locked — happens in `requireUser()` on every protected page and route.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api");
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Behind a reverse proxy the original scheme arrives in a header; Caddy sets
  // it. A request that genuinely arrived over plain HTTP gets neither header.
  const overHttps =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" ||
    request.nextUrl.protocol === "https:";

  // API routes authenticate themselves and answer with a 401 rather than a
  // redirect, which is what a fetch client expects.
  const response =
    !isApi && !isPublic && !hasSession
      ? NextResponse.redirect(new URL("/signin", request.url))
      : NextResponse.next();

  for (const [key, value] of securityPolicy(overHttps)) response.headers.set(key, value);
  // Nothing behind the session should ever sit in a shared cache.
  if (!isPublic) response.headers.set("Cache-Control", "no-store, private");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
