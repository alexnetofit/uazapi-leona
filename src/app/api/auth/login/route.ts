import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSessionToken, getSessionCookieConfig } from "@/lib/auth";
import { Redis } from "@upstash/redis";

const IP_LIMIT_KEY = "login:rate:ip:";
const IP_LIMIT_MAX = 10;
const IP_LIMIT_WINDOW = 300; // 5 min

const EMAIL_LIMIT_KEY = "login:rate:email:";
const EMAIL_LIMIT_MAX = 5;
const EMAIL_LIMIT_WINDOW = 300; // 5 min

function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/** Retorna null se liberado, ou os segundos restantes de bloqueio. */
async function checkAndBumpLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<number | null> {
  const redis = getRedisClient();
  if (!redis) return null; // sem Redis configurado, não derruba o login

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    if (current > max) {
      const ttl = await redis.ttl(key);
      return ttl > 0 ? ttl : windowSeconds;
    }
    return null;
  } catch {
    return null;
  }
}

async function clearLimit(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // ignora falha de limpeza — não é crítico
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const normalizedEmail = String(email).toLowerCase().trim();

    const ipBlockedFor = await checkAndBumpLimit(
      `${IP_LIMIT_KEY}${ip}`,
      IP_LIMIT_MAX,
      IP_LIMIT_WINDOW
    );
    const emailBlockedFor = await checkAndBumpLimit(
      `${EMAIL_LIMIT_KEY}${normalizedEmail}`,
      EMAIL_LIMIT_MAX,
      EMAIL_LIMIT_WINDOW
    );

    const blockedFor = Math.max(ipBlockedFor ?? 0, emailBlockedFor ?? 0);
    if (blockedFor > 0) {
      return NextResponse.json(
        {
          error: `Muitas tentativas. Aguarde ${Math.ceil(
            blockedFor / 60
          )} min e tente novamente.`,
        },
        { status: 429 }
      );
    }

    const user = authenticate(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // Login ok: libera as contagens para não penalizar o uso legítimo seguinte
    await Promise.all([
      clearLimit(`${IP_LIMIT_KEY}${ip}`),
      clearLimit(`${EMAIL_LIMIT_KEY}${normalizedEmail}`),
    ]);

    const token = await createSessionToken(user);
    const cookie = getSessionCookieConfig(token);

    const response = NextResponse.json({
      success: true,
      user: { email: user.email, role: user.role },
    });

    response.cookies.set(cookie);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
