import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export type UserRole = "admin" | "suporte";

export interface AuthUser {
  email: string;
  role: UserRole;
}

function getUsers(): { email: string; password: string; role: UserRole }[] {
  return [
    {
      email: process.env.ADMIN_EMAIL || "admin@leona.com",
      password: process.env.ADMIN_PASSWORD || "",
      role: "admin",
    },
    {
      email: process.env.SUPORTE_EMAIL || "suporte@leona.com",
      password: process.env.SUPORTE_PASSWORD || "",
      role: "suporte",
    },
  ];
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-me-in-production"
);
const COOKIE_NAME = "uazapi_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export function authenticate(email: string, password: string): AuthUser | null {
  const users = getUsers();
  const user = users.find(
    (u) =>
      u.password &&
      u.email.toLowerCase() === email.toLowerCase() &&
      u.password === password
  );
  if (!user) return null;
  return { email: user.email, role: user.role };
}

export async function createSessionToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(JWT_SECRET);
}

export async function verifySession(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.email || !payload.role) return null;
    return { email: payload.email as string, role: payload.role as UserRole };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function getSessionFromRequest(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export function getSessionCookieConfig(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

export function getLogoutCookieConfig() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}

export function isAdmin(user: AuthUser): boolean {
  return user.role === "admin";
}
