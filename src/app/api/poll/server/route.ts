import { NextRequest, NextResponse } from "next/server";
import { getServers, saveSnapshot, setLastPoll, getCachedDc } from "@/lib/kv";
import { fetchAllInstances, isConnected } from "@/lib/uazapi";
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

    let instances;
    try {
      instances = await fetchAllInstances(server.name, server.token);
    } catch {
      return NextResponse.json({
        server: server.name,
        status: "error",
      });
    }

    const totalInstances = instances.length;
    const connectedInstances = instances.filter(isConnected).length;
    const now = new Date().toISOString();
    const dc = await getCachedDc(server.name);

    const newSnapshot: ServerSnapshot = {
      serverName: server.name,
      instances: [],
      totalInstances,
      connectedInstances,
      disconnectedInstances: totalInstances - connectedInstances,
      timestamp: now,
      dc,
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
