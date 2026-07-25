import { CompetitorResult, CompetitorServerResult } from "./types";

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

interface StatusResponse {
  instance_counts?: {
    total?: number;
    connected?: number;
  };
  status?: {
    total_instances?: number;
  };
}

async function fetchServerStatus(
  host: string,
  timeoutMs: number
): Promise<CompetitorServerResult> {
  try {
    const res = await fetch(`https://${host}/status`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    if (!res.ok) {
      return { host, connected: 0, total: 0, error: true };
    }

    const body = (await res.json()) as StatusResponse;
    const counts = body.instance_counts;
    const connected = counts?.connected ?? body.status?.total_instances ?? 0;
    const total = counts?.total ?? 0;

    return { host, connected, total };
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
        competitor.hosts.map((host) => fetchServerStatus(host, timeoutMs))
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
