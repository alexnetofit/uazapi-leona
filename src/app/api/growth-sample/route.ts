import { NextRequest, NextResponse } from "next/server";
import { recordGrowthSample } from "@/lib/growth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (request.headers.get("x-user-role") === "admin") return true;
  return !cronSecret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await recordGrowthSample();
    return NextResponse.json({
      message: "Amostra de crescimento gravada",
      ...result,
    });
  } catch (error) {
    console.error("Erro ao gravar amostra de crescimento:", error);
    return NextResponse.json(
      { error: "Erro ao gravar amostra de crescimento" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
