import { NextResponse } from "next/server";
import { getServers, getAllSnapshots, getLastPoll, getPreviousCount } from "@/lib/kv";
import { DashboardData, ServerDashboard } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [servers, snapshots, lastPoll] = await Promise.all([
      getServers(),
      getAllSnapshots(),
      getLastPoll(),
    ]);

    // Mapa de snapshots por nome do servidor
    const snapshotMap = new Map(snapshots.map((s) => [s.serverName, s]));

    // Incluir TODOS os servidores cadastrados, mesmo sem snapshot
    const serversData: ServerDashboard[] = await Promise.all(
      servers.map(async (server) => {
        const snapshot = snapshotMap.get(server.name);
        const previous = await getPreviousCount(server.name);

        if (snapshot) {
          return {
            serverName: snapshot.serverName,
            totalInstances: snapshot.totalInstances,
            connectedInstances: snapshot.connectedInstances,
            disconnectedInstances: snapshot.disconnectedInstances,
            timestamp: snapshot.timestamp,
            previous,
            instances: [],
            error: false,
          };
        }

        // Servidor sem snapshot (nunca conseguiu conectar)
        return {
          serverName: server.name,
          totalInstances: 0,
          connectedInstances: 0,
          disconnectedInstances: 0,
          timestamp: "",
          previous: null,
          instances: [],
          error: true,
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
