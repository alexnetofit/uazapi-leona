import { Redis } from "@upstash/redis";
import { Server, ServerSnapshot, PreviousCount, NotificationLog, QueueEntry } from "./types";

const SERVERS_KEY = "uazapi:servers";
const SNAPSHOT_PREFIX = "uazapi:snapshot:";
const PREVIOUS_PREFIX = "uazapi:previous:";
const WEBHOOK_KEY = "uazapi:webhook_url";
const LAST_POLL_KEY = "uazapi:last_poll";

function isRedisConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getRedis(): Redis {
  if (!isRedisConfigured()) {
    throw new Error(
      "Banco de dados não configurado. Configure as variáveis KV_REST_API_URL e KV_REST_API_TOKEN na Vercel."
    );
  }
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
}

// --- Servidores ---

export async function getServers(): Promise<Server[]> {
  if (!isRedisConfigured()) return [];
  const redis = getRedis();
  const data = await redis.get<Server[]>(SERVERS_KEY);
  return data || [];
}

export async function addServer(server: Server): Promise<void> {
  const redis = getRedis();
  const servers = await getServers();
  const exists = servers.find((s) => s.name === server.name);
  if (exists) {
    throw new Error(`Servidor "${server.name}" já existe.`);
  }
  servers.push(server);
  await redis.set(SERVERS_KEY, servers);
}

export async function removeServer(name: string): Promise<void> {
  const redis = getRedis();
  const servers = await getServers();
  const filtered = servers.filter((s) => s.name !== name);
  await redis.set(SERVERS_KEY, filtered);
  // Remover snapshot associado
  await redis.del(`${SNAPSHOT_PREFIX}${name}`);
}

// --- Snapshots ---

export async function getSnapshot(
  serverName: string
): Promise<ServerSnapshot | null> {
  if (!isRedisConfigured()) return null;
  const redis = getRedis();
  const data = await redis.get<ServerSnapshot>(
    `${SNAPSHOT_PREFIX}${serverName}`
  );
  return data || null;
}

export async function saveSnapshot(snapshot: ServerSnapshot): Promise<void> {
  const redis = getRedis();
  // Salvar a contagem atual como "anterior" antes de sobrescrever
  const current = await getSnapshot(snapshot.serverName);
  if (current) {
    const prev: PreviousCount = {
      totalInstances: current.totalInstances,
      connectedInstances: current.connectedInstances,
      disconnectedInstances: current.disconnectedInstances,
      timestamp: current.timestamp,
    };
    await redis.set(`${PREVIOUS_PREFIX}${snapshot.serverName}`, prev);
  }
  await redis.set(`${SNAPSHOT_PREFIX}${snapshot.serverName}`, snapshot);
}

export async function getPreviousCount(
  serverName: string
): Promise<PreviousCount | null> {
  if (!isRedisConfigured()) return null;
  const redis = getRedis();
  const data = await redis.get<PreviousCount>(
    `${PREVIOUS_PREFIX}${serverName}`
  );
  return data || null;
}

export async function getAllSnapshots(): Promise<ServerSnapshot[]> {
  if (!isRedisConfigured()) return [];
  const servers = await getServers();
  if (servers.length === 0) return [];

  const redis = getRedis();
  const keys = servers.map((s) => `${SNAPSHOT_PREFIX}${s.name}`);
  const results = await redis.mget<(ServerSnapshot | null)[]>(...keys);

  return results.filter((s): s is ServerSnapshot => s !== null);
}

export async function getDashboardData(): Promise<{
  servers: Server[];
  snapshots: ServerSnapshot[];
  previousCounts: Map<string, PreviousCount | null>;
  lastPoll: string | null;
}> {
  if (!isRedisConfigured()) {
    return { servers: [], snapshots: [], previousCounts: new Map(), lastPoll: null };
  }

  const redis = getRedis();
  const servers = await redis.get<Server[]>(SERVERS_KEY) || [];

  if (servers.length === 0) {
    const lastPoll = await redis.get<string>(LAST_POLL_KEY) || null;
    return { servers: [], snapshots: [], previousCounts: new Map(), lastPoll };
  }

  const snapshotKeys = servers.map((s) => `${SNAPSHOT_PREFIX}${s.name}`);
  const previousKeys = servers.map((s) => `${PREVIOUS_PREFIX}${s.name}`);

  const [snapResults, prevResults, lastPoll] = await Promise.all([
    redis.mget<(ServerSnapshot | null)[]>(...snapshotKeys),
    redis.mget<(PreviousCount | null)[]>(...previousKeys),
    redis.get<string>(LAST_POLL_KEY),
  ]);

  const snapshots = snapResults.filter((s): s is ServerSnapshot => s !== null);

  const previousCounts = new Map<string, PreviousCount | null>();
  servers.forEach((server, i) => {
    previousCounts.set(server.name, prevResults[i] || null);
  });

  return { servers, snapshots, previousCounts, lastPoll: lastPoll || null };
}

export async function getSnapshotsByNames(
  serverNames: string[]
): Promise<Map<string, ServerSnapshot | null>> {
  if (!isRedisConfigured() || serverNames.length === 0) return new Map();
  const redis = getRedis();
  const keys = serverNames.map((n) => `${SNAPSHOT_PREFIX}${n}`);
  const results = await redis.mget<(ServerSnapshot | null)[]>(...keys);
  const map = new Map<string, ServerSnapshot | null>();
  serverNames.forEach((name, i) => {
    map.set(name, results[i] || null);
  });
  return map;
}

export async function batchSaveSnapshots(
  snapshots: ServerSnapshot[],
  previousSnapshots: Map<string, ServerSnapshot | null>
): Promise<void> {
  if (!isRedisConfigured() || snapshots.length === 0) return;
  const redis = getRedis();
  const entries: Record<string, unknown> = {};

  for (const snapshot of snapshots) {
    entries[`${SNAPSHOT_PREFIX}${snapshot.serverName}`] = snapshot;
    const prev = previousSnapshots.get(snapshot.serverName);
    if (prev) {
      entries[`${PREVIOUS_PREFIX}${snapshot.serverName}`] = {
        totalInstances: prev.totalInstances,
        connectedInstances: prev.connectedInstances,
        disconnectedInstances: prev.disconnectedInstances,
        timestamp: prev.timestamp,
      } as PreviousCount;
    }
  }

  await redis.mset(entries);
}

// --- Webhook ---

export async function getWebhookUrl(): Promise<string | null> {
  if (!isRedisConfigured()) return null;
  const redis = getRedis();
  const url = await redis.get<string>(WEBHOOK_KEY);
  return url || null;
}

export async function setWebhookUrl(url: string): Promise<void> {
  const redis = getRedis();
  await redis.set(WEBHOOK_KEY, url);
}

// --- Last Poll ---

export async function getLastPoll(): Promise<string | null> {
  if (!isRedisConfigured()) return null;
  const redis = getRedis();
  const timestamp = await redis.get<string>(LAST_POLL_KEY);
  return timestamp || null;
}

export async function setLastPoll(timestamp: string): Promise<void> {
  const redis = getRedis();
  await redis.set(LAST_POLL_KEY, timestamp);
}

// --- Notification Logs ---

const LOGS_KEY = "uazapi:notification_logs";
const MAX_LOGS = 100;

export async function saveLog(log: NotificationLog): Promise<void> {
  if (!isRedisConfigured()) return;
  const redis = getRedis();
  const logs = await redis.get<NotificationLog[]>(LOGS_KEY) || [];
  logs.unshift(log);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  await redis.set(LOGS_KEY, logs);
}

export async function getLogs(): Promise<NotificationLog[]> {
  if (!isRedisConfigured()) return [];
  const redis = getRedis();
  const logs = await redis.get<NotificationLog[]>(LOGS_KEY) || [];
  return logs;
}

export async function clearLogs(): Promise<void> {
  if (!isRedisConfigured()) return;
  const redis = getRedis();
  await redis.del(LOGS_KEY);
}

// --- DC Cache ---

const DC_PREFIX = "uazapi:dc:";
const DC_LAST_FETCH_KEY = "uazapi:dc_last_fetch";

export async function getCachedDc(serverName: string): Promise<string> {
  if (!isRedisConfigured()) return "";
  const redis = getRedis();
  const dc = await redis.get<string>(`${DC_PREFIX}${serverName}`);
  return dc || "";
}

export async function saveDcCache(serverName: string, dc: string): Promise<void> {
  if (!isRedisConfigured()) return;
  const redis = getRedis();
  await redis.set(`${DC_PREFIX}${serverName}`, dc);
}

export async function getDcLastFetch(): Promise<string | null> {
  if (!isRedisConfigured()) return null;
  const redis = getRedis();
  return await redis.get<string>(DC_LAST_FETCH_KEY) || null;
}

export async function setDcLastFetch(date: string): Promise<void> {
  if (!isRedisConfigured()) return;
  const redis = getRedis();
  await redis.set(DC_LAST_FETCH_KEY, date);
}

export function shouldFetchDcToday(lastFetch: string | null): boolean {
  if (!lastFetch) return true;
  const now = new Date();
  const brtNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const lastDate = new Date(lastFetch);
  const brtLast = new Date(lastDate.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return brtNow.toDateString() !== brtLast.toDateString();
}

// --- Queue Data ---

const QUEUE_DATA_KEY = "uazapi:queue_data";
const QUEUE_LAST_CHECK_KEY = "uazapi:queue_last_check";

export async function getQueueData(): Promise<QueueEntry[]> {
  if (!isRedisConfigured()) return [];
  const redis = getRedis();
  const data = await redis.get<QueueEntry[]>(QUEUE_DATA_KEY);
  return data || [];
}

export async function saveQueueData(entries: QueueEntry[]): Promise<void> {
  if (!isRedisConfigured()) return;
  const redis = getRedis();
  await redis.set(QUEUE_DATA_KEY, entries);
  await redis.set(QUEUE_LAST_CHECK_KEY, new Date().toISOString());
}

export async function getQueueLastCheck(): Promise<string | null> {
  if (!isRedisConfigured()) return null;
  const redis = getRedis();
  return await redis.get<string>(QUEUE_LAST_CHECK_KEY) || null;
}

// --- Connected Instances Cache ---

const CONNECTED_INSTANCES_KEY = "uazapi:connected_instances";

export interface CachedInstance {
  server: string;
  name: string;
  owner: string;
  token: string;
}

export async function saveConnectedInstances(instances: CachedInstance[]): Promise<void> {
  if (!isRedisConfigured()) return;
  const redis = getRedis();
  await redis.set(CONNECTED_INSTANCES_KEY, instances);
}

export async function getConnectedInstances(): Promise<CachedInstance[]> {
  if (!isRedisConfigured()) return [];
  const redis = getRedis();
  const data = await redis.get<CachedInstance[]>(CONNECTED_INSTANCES_KEY);
  return data || [];
}

// --- Queue Server Fail Tracking ---

const QUEUE_FAIL_PREFIX = "uazapi:queue_fail:";

export async function getQueueFailCount(serverName: string): Promise<number> {
  if (!isRedisConfigured()) return 0;
  const redis = getRedis();
  const count = await redis.get<number>(`${QUEUE_FAIL_PREFIX}${serverName}`);
  return count || 0;
}

export async function incrementQueueFail(serverName: string): Promise<number> {
  const redis = getRedis();
  const key = `${QUEUE_FAIL_PREFIX}${serverName}`;
  const current = await redis.get<number>(key) || 0;
  const next = current + 1;
  await redis.set(key, next);
  return next;
}

export async function resetQueueFail(serverName: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${QUEUE_FAIL_PREFIX}${serverName}`);
}

// --- Push Subscriptions ---

const PUSH_SUBS_KEY = "uazapi:push_subscriptions";

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function getPushSubscriptions(): Promise<PushSubscriptionData[]> {
  if (!isRedisConfigured()) return [];
  const redis = getRedis();
  const data = await redis.get<PushSubscriptionData[]>(PUSH_SUBS_KEY);
  return data || [];
}

export async function addPushSubscription(sub: PushSubscriptionData): Promise<void> {
  const redis = getRedis();
  const subs = await getPushSubscriptions();
  // Evitar duplicatas pelo endpoint
  const exists = subs.find((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    subs.push(sub);
    await redis.set(PUSH_SUBS_KEY, subs);
  }
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const redis = getRedis();
  const subs = await getPushSubscriptions();
  const filtered = subs.filter((s) => s.endpoint !== endpoint);
  await redis.set(PUSH_SUBS_KEY, filtered);
}
