import { NextRequest, NextResponse } from "next/server";
import { getQueueData, getQueueLastCheck } from "@/lib/kv";
import { getUserRole } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const role = getUserRole(request);
    const entries = await getQueueData();
    const lastCheck = await getQueueLastCheck();

    const safeEntries = entries.map((entry) => ({
      ...entry,
      token: role === "admin" ? entry.token : undefined,
    }));

    return NextResponse.json({
      entries: safeEntries,
      lastCheck,
    });
  } catch (error) {
    console.error("Erro ao buscar dados de fila:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados de fila" },
      { status: 500 }
    );
  }
}
