import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

const PUBLIC_PREFIX_PATHS = [
  "/api/auth/login",
  "/api/poll",
  "/login",
];

const PUBLIC_EXACT_PATHS = [
  "/api/queue-monitor",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIX_PATHS.some((p) => pathname.startsWith(p));
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("uazapi_session")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const user = await verifySession(token);

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const headers = new Headers(request.headers);
  headers.set("x-user-email", user.email);
  headers.set("x-user-role", user.role);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
