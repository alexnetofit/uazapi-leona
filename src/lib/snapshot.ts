import { Server, ServerSnapshot } from "./types";
import { buildUnreachableSnapshot, getCachedDc, saveDcCache } from "./kv";
import { fetchAllInstances, fetchServerStatus, isConnected } from "./uazapi";

const STATUS_TIMEOUT_MS = 8000;

function buildSnapshot(
  serverName: string,
  total: number,
  connected: number,
  disconnected: number,
  dc: string
): ServerSnapshot {
  return {
    serverName,
    instances: [],
    totalInstances: total,
    connectedInstances: connected,
    disconnectedInstances: disconnected,
    timestamp: new Date().toISOString(),
    dc,
    error: false,
  };
}

/**
 * Conta instâncias de um servidor.
 *
 * Usa /status, que já entrega instance_counts + dc numa chamada leve e sem token.
 * Só varre /instance/all se o servidor for antigo e não expor instance_counts.
 */
export async function buildServerSnapshot(
  server: Server
): Promise<ServerSnapshot> {
  let status;
  try {
    status = await fetchServerStatus(server.name, STATUS_TIMEOUT_MS);
  } catch {
    // Uma segunda tentativa: /status é leve, falha isolada costuma ser instabilidade
    try {
      await new Promise((r) => setTimeout(r, 1500));
      status = await fetchServerStatus(server.name, STATUS_TIMEOUT_MS);
    } catch {
      return buildUnreachableSnapshot(server.name, await getCachedDc(server.name));
    }
  }

  const dc = status.dc || (await getCachedDc(server.name));
  if (status.dc) await saveDcCache(server.name, status.dc);

  if (status.counts) {
    return buildSnapshot(
      server.name,
      status.counts.total,
      status.counts.connected,
      status.counts.disconnected,
      dc
    );
  }

  try {
    const instances = await fetchAllInstances(server.name, server.token);
    const total = instances.length;
    const connected = instances.filter(isConnected).length;
    return buildSnapshot(server.name, total, connected, total - connected, dc);
  } catch {
    return buildUnreachableSnapshot(server.name, dc);
  }
}
