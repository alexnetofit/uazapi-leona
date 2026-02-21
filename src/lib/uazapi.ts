import { Instance } from "./types";

export interface ServerStatus {
  isHealthy: boolean;
  connectedInstances: number;
  serverStatus: string;
  lastCheck: string;
}

export async function fetchServerStatus(
  serverName: string
): Promise<ServerStatus> {
  const url = `https://${serverName}.uazapi.com/status`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Erro ao buscar status do servidor ${serverName}: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Formato 1: servidor com instâncias conectadas
  // { status: { checked_instance: { is_healthy: true }, total_instances: 146, server_status: "running" } }
  if (data?.status && typeof data.status === "object") {
    const status = data.status;
    const checked = status.checked_instance || {};
    return {
      isHealthy: checked.is_healthy === true,
      connectedInstances: status.total_instances ?? 0,
      serverStatus: status.server_status || "running",
      lastCheck: status.last_check || new Date().toISOString(),
    };
  }

  // Formato 2: servidor de pé mas sem instâncias conectadas
  // { connected_instances: 0, status: "warning", info: "Server is up but no instances connected" }
  if (data?.status === "warning" || data?.connected_instances !== undefined) {
    return {
      isHealthy: true,
      connectedInstances: data.connected_instances ?? 0,
      serverStatus: "running",
      lastCheck: new Date().toISOString(),
    };
  }

  return {
    isHealthy: false,
    connectedInstances: 0,
    serverStatus: "unknown",
    lastCheck: new Date().toISOString(),
  };
}

export async function fetchAllInstances(
  serverName: string,
  adminToken: string
): Promise<Instance[]> {
  const url = `https://${serverName}.uazapi.com/instance/all`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      AdminToken: adminToken,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Erro ao buscar instâncias do servidor ${serverName}: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // A API pode retornar um array diretamente ou um objeto com propriedade
  if (Array.isArray(data)) {
    return data;
  }

  // Tentar encontrar o array de instâncias no objeto retornado
  if (data && typeof data === "object") {
    const possibleArrayKeys = ["instances", "data", "result"];
    for (const key of possibleArrayKeys) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
  }

  return [];
}

export function isConnected(instance: Instance): boolean {
  const status = (instance.status || "").toLowerCase();
  return status === "connected";
}

export function getInstanceNumber(instance: Instance): string {
  return instance.owner || instance.name || "";
}
