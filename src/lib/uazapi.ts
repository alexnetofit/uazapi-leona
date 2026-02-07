import { Instance } from "./types";

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
  const status = (instance.connectionStatus || "").toLowerCase();
  return status === "open" || status === "connected";
}

export function getInstanceNumber(instance: Instance): string {
  // ownerJid geralmente é no formato "5511999999999@s.whatsapp.net"
  const jid = instance.ownerJid || instance.name || "";
  return jid.replace(/@.*$/, "");
}
