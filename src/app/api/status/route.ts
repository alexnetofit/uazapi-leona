import { NextResponse } from "next/server";
import { getAllSnapshots, getLastPoll, getPreviousCount } from "@/lib/kv";
import { DashboardData, ServerDashboard } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [snapshots, lastPoll] = await Promise.all([
      getAllSnapshots(),
      getLastPoll(),
    ]);

    // Buscar dados anteriores para cada servidor
    const serversData: ServerDashboard[] = await Promise.all(
      snapshots.map(async (s) => {
        const previous = await getPreviousCount(s.serverName);
        return {
          serverName: s.serverName,
          totalInstances: s.totalInstances,
          connectedInstances: s.connectedInstances,
          disconnectedInstances: s.disconnectedInstances,
          timestamp: s.timestamp,
          previous,
          instances: [],
        };
      })
    );

    const totalInstances = snapshots.reduce(
      (sum, s) => sum + s.totalInstances,
      0
    );
    const totalConnected = snapshots.reduce(
      (sum, s) => sum + s.connectedInstances,
      0
    );

    const data: DashboardData = {
      servers: serversData,
      totalInstances,
      totalConnected,
      totalDisconnected: totalInstances - totalConnected,
      lastPoll,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro ao buscar status:", error);
    return NextResponse.json(
      { error: "Erro ao buscar status" },
      { status: 500 }
    );
  }
}
