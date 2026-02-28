import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "./auth";

export function getUserRole(request: NextRequest): UserRole {
  return (request.headers.get("x-user-role") as UserRole) || "suporte";
}

export function requireAdmin(request: NextRequest): NextResponse | null {
  const role = getUserRole(request);
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Acesso restrito ao administrador" },
      { status: 403 }
    );
  }
  return null;
}
