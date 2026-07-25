import { NextResponse } from "next/server";
import { fetchCompetitors } from "@/lib/competitors";
import { CompetitorsData } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const competitors = await fetchCompetitors();

    const data: CompetitorsData = {
      competitors,
      totalConnected: competitors.reduce((sum, c) => sum + c.connected, 0),
      checkedAt: new Date().toISOString(),
    };

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Erro ao buscar concorrentes:", error);
    return NextResponse.json(
      { error: "Erro ao buscar concorrentes" },
      { status: 500 }
    );
  }
}
