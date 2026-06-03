import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/kv";
import { DashboardData, ServerDashboard } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { servers, snapshots, previousCounts, lastPoll } =
      await getDashboardData();

    const snapshotMap = new Map(snapshots.map((s) => [s.serverName, s]));

    const serversData: ServerDashboard[] = servers.map((server) => {
      const snapshot = snapshotMap.get(server.name);
      const previous = previousCounts.get(server.name) ?? null;

      if (snapshot) {
        return {
          serverName: snapshot.serverName,
          totalInstances: snapshot.totalInstances,
          connectedInstances: snapshot.connectedInstances,
          disconnectedInstances: snapshot.disconnectedInstances,
          timestamp: snapshot.timestamp,
          previous,
          instances: [],
          error: snapshot.error === true,
          dc: snapshot.dc || "",
        };
      }

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
    });

    const healthySnapshots = snapshots.filter((s) => s.error !== true);

    const totalInstances = healthySnapshots.reduce(
      (sum, s) => sum + s.totalInstances,
      0
    );
    const totalConnected = healthySnapshots.reduce(
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

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Erro ao buscar status:", error);
    return NextResponse.json(
      { error: "Erro ao buscar status" },
      { status: 500 }
    );
  }
}
