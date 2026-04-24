import { NextRequest, NextResponse } from "next/server";
import { getQueueData, getQueueLastCheck, getCachedDc } from "@/lib/kv";
import { getUserRole } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const role = getUserRole(request);
    const entries = await getQueueData();
    const lastCheck = await getQueueLastCheck();

    const uniqueServers = Array.from(new Set(entries.map((e) => e.server)));
    const dcEntries = await Promise.all(
      uniqueServers.map(async (name) => [name, await getCachedDc(name)] as const)
    );
    const dcMap = new Map(dcEntries);

    const safeEntries = entries.map((entry) => ({
      ...entry,
      token: role === "admin" ? entry.token : undefined,
      dc: dcMap.get(entry.server) || "",
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
