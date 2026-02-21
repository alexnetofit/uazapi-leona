import { Instance } from "./types";

export interface ServerStatus {
  isHealthy: boolean;
  totalInstances: number;
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
  const status = data?.status || {};
  const checked = status.checked_instance || {};

  return {
    isHealthy: checked.is_healthy === true,
    totalInstances: status.total_instances ?? 0,
    serverStatus: status.server_status || "unknown",
    lastCheck: status.last_check || new Date().toISOString(),
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
