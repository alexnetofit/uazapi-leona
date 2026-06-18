import { Instance } from "./types";

export interface ServerStatus {
  isHealthy: boolean;
  connectedInstances: number;
  serverStatus: string;
  lastCheck: string;
  dc: string;
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
      dc: status.dc || "",
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
      dc: data.dc || "",
    };
  }

  return {
    isHealthy: false,
    connectedInstances: 0,
    serverStatus: "unknown",
    lastCheck: new Date().toISOString(),
    dc: "",
  };
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Normaliza busca: últimos 8 dígitos se tiver mais de 8 (igual ao SearchBar). */
export function normalizeSearchDigits(input: string): string {
  const digits = digitsOnly(input);
  return digits.length > 8 ? digits.slice(-8) : digits;
}

export function instanceMatchesSearch(
  searchDigits: string,
  instance: Instance
): boolean {
  const candidates = [
    digitsOnly(getInstanceNumber(instance)),
    digitsOnly(instance.name || ""),
  ].filter((d) => d.length >= 8);

  if (candidates.length === 0) return false;

  const searchKey =
    searchDigits.length > 8 ? searchDigits.slice(-8) : searchDigits;

  for (const instDigits of candidates) {
    if (instDigits === searchDigits) return true;
    if (instDigits.includes(searchDigits) && searchDigits.length >= 8)
      return true;
    if (searchDigits.includes(instDigits) && instDigits.length >= 8)
      return true;
    const instKey =
      instDigits.length > 8 ? instDigits.slice(-8) : instDigits;
    if (instKey === searchKey) return true;
  }

  return false;
}

export async function fetchAllInstances(
  serverName: string,
  adminToken: string,
  timeoutMs = 12000
): Promise<Instance[]> {
  const url = `https://${serverName}.uazapi.com/instance/all`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      AdminToken: adminToken,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
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

export interface QueueStatus {
  status: string;
  pending: number;
  processingNow: boolean;
  acceptingNewMessages: boolean;
  sessionReady: boolean;
  resetting: boolean;
}

export async function fetchQueueStatus(
  serverName: string,
  instanceToken: string
): Promise<QueueStatus> {
  const url = `https://${serverName}.uazapi.com/message/async`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      token: instanceToken,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Erro ao buscar fila: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const q = data.queue || data;

  return {
    status: q.status || "unknown",
    pending: q.pending ?? 0,
    processingNow: q.processingNow ?? false,
    acceptingNewMessages: q.acceptingNewMessages ?? true,
    sessionReady: q.sessionReady ?? false,
    resetting: q.resetting ?? false,
  };
}

export function isConnected(instance: Instance): boolean {
  const status = (instance.status || "").toLowerCase();
  return status === "connected";
}

export function getInstanceNumber(instance: Instance): string {
  return instance.owner || instance.name || "";
}
