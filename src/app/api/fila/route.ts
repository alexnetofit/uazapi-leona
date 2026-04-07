import { NextRequest, NextResponse } from "next/server";
import { getServers } from "@/lib/kv";
import { fetchAllInstances, getInstanceNumber } from "@/lib/uazapi";
import { Redis } from "@upstash/redis";

export const maxDuration = 60;

const redis = Redis.fromEnv();
const RATE_LIMIT_KEY = "fila:rate:";
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60;

async function checkRateLimit(ip: string): Promise<boolean> {
  const key = `${RATE_LIMIT_KEY}${ip}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }
  return current <= RATE_LIMIT_MAX;
}

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

    if (!number || number.replace(/\D/g, "").length < 8) {
      return NextResponse.json(
        { error: "Informe pelo menos 8 dígitos" },
        { status: 400 }
      );
    }

    const searchTerm = number.replace(/\D/g, "");
    const servers = await getServers();

    if (servers.length === 0) {
      return NextResponse.json(
        { error: "Serviço indisponível" },
        { status: 503 }
      );
    }

    let foundServer = "";
    let foundToken = "";

    const results = await Promise.allSettled(
      servers.map(async (server) => {
        const instances = await fetchAllInstances(server.name, server.token);
        for (const inst of instances) {
          const instNumber = getInstanceNumber(inst);
          if (instNumber.includes(searchTerm) || searchTerm.includes(instNumber)) {
            if (inst.token) {
              return { server: server.name, token: inst.token };
            }
          }
        }
        return null;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        foundServer = r.value.server;
        foundToken = r.value.token;
        break;
      }
    }

    if (!foundServer || !foundToken) {
      return NextResponse.json({ found: false });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        `https://${foundServer}.uazapi.com/message/async`,
        {
          method: "GET",
          headers: { Accept: "application/json", token: foundToken },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json(
          { found: true, error: "Não foi possível verificar a fila" },
          { status: 200 }
        );
      }

      const data = await res.json();
      const q = data.queue || data;

      return NextResponse.json({
        found: true,
        queue: {
          pending: q.pending ?? 0,
          status: q.status ?? "unknown",
          processingNow: q.processingNow ?? false,
          sessionReady: q.sessionReady ?? false,
          resetting: q.resetting ?? false,
        },
      });
    } catch {
      clearTimeout(timeout);
      return NextResponse.json(
        { found: true, error: "Timeout ao verificar fila" },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Erro na busca de fila:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
