import { NextRequest, NextResponse } from "next/server";
import { getLogs, clearLogs } from "@/lib/kv";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logs = await getLogs();
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Erro ao buscar logs:", error);
    return NextResponse.json(
      { error: "Erro ao buscar logs" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    await clearLogs();
    return NextResponse.json({ success: true, message: "Logs limpos" });
  } catch (error) {
    console.error("Erro ao limpar logs:", error);
    return NextResponse.json(
      { error: "Erro ao limpar logs" },
      { status: 500 }
    );
  }
}
