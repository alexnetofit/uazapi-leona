import { NextRequest, NextResponse } from "next/server";
import { getServers, getSnapshot, saveSnapshot, setLastPoll } from "@/lib/kv";
import { fetchServerStatus, fetchAllInstances } from "@/lib/uazapi";
import { ServerSnapshot } from "@/lib/types";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { serverName } = await request.json();

    if (!serverName) {
      return NextResponse.json(
        { error: "serverName é obrigatório" },
        { status: 400 }
      );
    }

    const servers = await getServers();
    const server = servers.find((s) => s.name === serverName);

    if (!server) {
      return NextResponse.json(
        { error: "Servidor não encontrado" },
        { status: 404 }
      );
    }

    let serverStatus;
    try {
      serverStatus = await fetchServerStatus(server.name);
    } catch {
      return NextResponse.json({
        server: server.name,
        status: "error",
      });
    }

    if (!serverStatus.isHealthy) {
      return NextResponse.json({
        server: server.name,
        status: "unhealthy",
        connectedInstances: serverStatus.connectedInstances,
      });
    }

    const connectedInstances = serverStatus.connectedInstances;
    const now = new Date().toISOString();

    const [totalInstances] = await Promise.all([
      fetchAllInstances(server.name, server.token)
        .then((inst) => inst.length)
        .catch(() => connectedInstances),
      getSnapshot(server.name),
    ]);

    const newSnapshot: ServerSnapshot = {
      serverName: server.name,
      instances: [],
      totalInstances,
      connectedInstances,
      disconnectedInstances: totalInstances - connectedInstances,
      timestamp: now,
      dc: serverStatus.dc,
    };

    await saveSnapshot(newSnapshot);
    await setLastPoll(now);

    return NextResponse.json({
      server: server.name,
      status: "ok",
      snapshot: newSnapshot,
    });
  } catch (error) {
    console.error("Erro ao pollar servidor individual:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
