import { CompetitorResult, CompetitorServerResult } from "./types";
import { fetchStatusByHost } from "./uazapi";

interface CompetitorDefinition {
  name: string;
  hosts: string[];
}

export const COMPETITORS: CompetitorDefinition[] = [
  {
    name: "Zapdata",
    hosts: [
      "zapdata.uazapi.com",
      "zapdatatwo.uazapi.com",
      "zapdatatres.uazapi.com",
      "zapdatafour.uazapi.com",
      "zapdatafive.uazapi.com",
      "zapdataseis.uazapi.com",
      "zapdataeight.uazapi.com",
      "v2zapdataone.uazapi.com",
    ],
  },
  {
    name: "Zapix",
    hosts: ["api1-zapixbot.uazapi.com", "api2-zapixbot.uazapi.com"],
  },
  {
    name: "BrutalZap",
    hosts: ["brutalzap.uazapi.com"],
  },
];

async function fetchCompetitorServer(
  host: string,
  timeoutMs: number
): Promise<CompetitorServerResult> {
  try {
    const { counts } = await fetchStatusByHost(host, timeoutMs);
    if (!counts) return { host, connected: 0, total: 0, error: true };
    return { host, connected: counts.connected, total: counts.total };
  } catch {
    return { host, connected: 0, total: 0, error: true };
  }
}

export async function fetchCompetitors(
  timeoutMs = 10000
): Promise<CompetitorResult[]> {
  return Promise.all(
    COMPETITORS.map(async (competitor) => {
      const servers = await Promise.all(
        competitor.hosts.map((host) => fetchCompetitorServer(host, timeoutMs))
      );

      const healthy = servers.filter((s) => !s.error);

      return {
        name: competitor.name,
        servers,
        connected: healthy.reduce((sum, s) => sum + s.connected, 0),
        total: healthy.reduce((sum, s) => sum + s.total, 0),
        failedServers: servers.length - healthy.length,
      };
    })
  );
}
