import { Redis } from "@upstash/redis";
import { Server, ServerSnapshot } from "./types";

const SERVERS_KEY = "uazapi:servers";
const SNAPSHOT_PREFIX = "uazapi:snapshot:";
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
  await redis.set(`${SNAPSHOT_PREFIX}${snapshot.serverName}`, snapshot);
}

export async function getAllSnapshots(): Promise<ServerSnapshot[]> {
  const servers = await getServers();
  const snapshots: ServerSnapshot[] = [];

  for (const server of servers) {
    const snapshot = await getSnapshot(server.name);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }

  return snapshots;
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
