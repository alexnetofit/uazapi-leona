import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { readGrowthData, recordGrowthSample } from "@/lib/growth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readGrowthData();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Erro ao ler crescimento:", error);
    return NextResponse.json(
      { error: "Erro ao ler crescimento" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const result = await recordGrowthSample();
    const data = await readGrowthData();
    return NextResponse.json({
      message: "Amostra de crescimento gravada",
      sampleCount: result.sampleCount,
      day: result.day,
      data,
    });
  } catch (error) {
    console.error("Erro ao gravar amostra de crescimento:", error);
    return NextResponse.json(
      { error: "Erro ao gravar amostra de crescimento" },
      { status: 500 }
    );
  }
}
