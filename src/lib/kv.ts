import { Redis } from "@upstash/redis";
import { Server, ServerSnapshot, PreviousCount } from "./types";

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
