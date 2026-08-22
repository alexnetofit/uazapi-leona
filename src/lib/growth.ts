import { COMPETITORS, fetchCompetitors } from "./competitors";
import {
  getGrowthDays,
  getGrowthSamples,
  getServers,
  saveGrowthSamples,
  upsertGrowthDay,
} from "./kv";
import { buildServerSnapshot } from "./snapshot";
import {
  GrowthData,
  GrowthDay,
  GrowthPlayerCounts,
  GrowthSample,
  GrowthSeriesPoint,
  GrowthSlot,
} from "./types";

export const GROWTH_PLAYERS = [
  "Leona",
  ...COMPETITORS.map((c) => c.name),
] as const;

export function brtParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

export function slotForHour(hour: number): GrowthSlot {
  if (hour === 0 || hour >= 19) return "night";
  if (hour >= 13) return "afternoon";
  return "morning";
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

export function averageSamples(day: string, samples: GrowthSample[]): GrowthDay {
  const names = new Set(samples.flatMap((s) => Object.keys(s.players)));
  const players: GrowthDay["players"] = {};
  for (const name of names) {
    const vals = samples
      .map((s) => s.players[name])
      .filter((p): p is GrowthPlayerCounts => !!p);
    if (vals.length === 0) continue;
    players[name] = {
      connected: mean(vals.map((p) => p.connected)),
      total: mean(vals.map((p) => p.total)),
    };
  }
  return { day, sampleCount: samples.length, players };
}

async function collectLeona(): Promise<GrowthPlayerCounts | null> {
  const servers = await getServers();
  if (servers.length === 0) return null;

  const snapshots = await Promise.all(
    servers.map((server) => buildServerSnapshot(server))
  );
  const healthy = snapshots.filter((s) => !s.error);
  if (healthy.length === 0) return null;

  return {
    connected: healthy.reduce((sum, s) => sum + s.connectedInstances, 0),
    total: healthy.reduce((sum, s) => sum + s.totalInstances, 0),
    failedServers: snapshots.length - healthy.length,
  };
}

export async function collectGrowthSample(): Promise<GrowthSample> {
  const now = new Date();
  const { hour } = brtParts(now);
  const [leona, competitors] = await Promise.all([
    collectLeona(),
    fetchCompetitors(),
  ]);

  const players: Record<string, GrowthPlayerCounts> = {};
  if (leona) players.Leona = leona;

  for (const competitor of competitors) {
    const healthy = competitor.servers.length - competitor.failedServers;
    if (healthy <= 0) continue;
    players[competitor.name] = {
      connected: competitor.connected,
      total: competitor.total,
      failedServers: competitor.failedServers,
    };
  }

  return {
    at: now.toISOString(),
    slot: slotForHour(hour),
    hour,
    players,
  };
}

export async function recordGrowthSample(sample?: GrowthSample) {
  const next = sample ?? (await collectGrowthSample());
  const { day } = brtParts(new Date(next.at));
  const existing = await getGrowthSamples(day);
  const withoutSameHour = existing.filter((s) => s.hour !== next.hour);
  const samples = [...withoutSameHour, next].sort((a, b) =>
    a.at.localeCompare(b.at)
  );
  await saveGrowthSamples(day, samples);
  const days = await upsertGrowthDay(averageSamples(day, samples));
  return { day, sample: next, sampleCount: samples.length, days };
}

function buildSeries(days: GrowthDay[]): Record<string, GrowthSeriesPoint[]> {
  const series: Record<string, GrowthSeriesPoint[]> = {};
  for (const name of GROWTH_PLAYERS) {
    series[name] = days.map((current, index) => {
      const prev = index > 0 ? days[index - 1].players[name] : undefined;
      const cur = current.players[name];
      return {
        day: current.day,
        sampleCount: current.sampleCount,
        connected: cur?.connected ?? null,
        total: cur?.total ?? null,
        connectedDelta:
          cur && prev ? cur.connected - prev.connected : null,
        totalDelta: cur && prev ? cur.total - prev.total : null,
      };
    });
  }
  return series;
}

export async function readGrowthData(): Promise<GrowthData> {
  const days = await getGrowthDays();
  const today = brtParts().day;
  const todaySamples = await getGrowthSamples(today);
  const lastSampleAt =
    todaySamples.at(-1)?.at ??
    days.at(-1)?.day ??
    null;

  return {
    players: [...GROWTH_PLAYERS],
    days,
    series: buildSeries(days),
    lastSampleAt,
  };
}
