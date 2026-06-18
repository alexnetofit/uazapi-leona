import { NextRequest, NextResponse } from "next/server";
import { getServers } from "@/lib/kv";
import {
  fetchAllInstances,
  digitsOnly,
  instanceMatchesSearch,
  fetchQueueStatus,
  isConnected,
} from "@/lib/uazapi";
import { Instance } from "@/lib/types";
import { Redis } from "@upstash/redis";

export const maxDuration = 60;

const RATE_LIMIT_KEY = "fila:rate:";
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60;

function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;

  try {
    const key = `${RATE_LIMIT_KEY}${ip}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }
    return current <= RATE_LIMIT_MAX;
  } catch {
    return true;
  }
}

type FoundInstance = { server: string; token: string; connected: boolean };

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Muitas requisições. Aguarde um momento." },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const number = searchParams.get("number");

    const searchDigits = digitsOnly(number || "");
    if (searchDigits.length < 8) {
      return NextResponse.json(
        { error: "Informe pelo menos 8 dígitos" },
        { status: 400 }
      );
    }

    const servers = await getServers();

    if (servers.length === 0) {
      return NextResponse.json(
        { error: "Serviço indisponível" },
        { status: 503 }
      );
    }

    const matches: FoundInstance[] = [];

    await Promise.allSettled(
      servers.map(async (server) => {
        const instances = await fetchAllInstances(server.name, server.token);
        for (const inst of instances) {
          if (!inst.token || !instanceMatchesSearch(searchDigits, inst)) continue;
          matches.push({
            server: server.name,
            token: inst.token,
            connected: isConnected(inst),
          });
        }
      })
    );

    if (matches.length === 0) {
      return NextResponse.json({ found: false });
    }

    // Preferir instância conectada; senão, a primeira encontrada
    const best =
      matches.find((m) => m.connected) ?? matches[0];

    try {
      const queue = await fetchQueueStatus(best.server, best.token);

      return NextResponse.json({
        found: true,
        queue: {
          pending: queue.pending,
          status: queue.status,
          processingNow: queue.processingNow,
          sessionReady: queue.sessionReady,
          resetting: queue.resetting,
        },
      });
    } catch {
      return NextResponse.json(
        { found: true, error: "Não foi possível verificar a fila" },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Erro na busca de fila:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
