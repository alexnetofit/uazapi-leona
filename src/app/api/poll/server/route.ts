import { NextRequest, NextResponse } from "next/server";
import { getServers, saveSnapshot, setLastPoll } from "@/lib/kv";
import { buildServerSnapshot } from "@/lib/snapshot";

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

    const snapshot = await buildServerSnapshot(server);

    await saveSnapshot(snapshot);
    await setLastPoll(snapshot.timestamp);

    return NextResponse.json({
      server: server.name,
      status: snapshot.error ? "error" : "ok",
      snapshot,
    });
  } catch (error) {
    console.error("Erro ao pollar servidor individual:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
