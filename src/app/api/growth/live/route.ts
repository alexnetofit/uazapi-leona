import { NextResponse } from "next/server";
import { collectGrowthSample } from "@/lib/growth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Contagem AO VIVO de Leona e concorrentes.
 * Só lê os /status — não grava amostra nem mexe no histórico de snapshots
 * (quem grava é /api/growth-sample, chamado pelo cron).
 */
export async function GET() {
  try {
    const sample = await collectGrowthSample();
    return NextResponse.json(
      { at: sample.at, players: sample.players },
      {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao coletar contagem ao vivo:", error);
    return NextResponse.json(
      { error: "Erro ao coletar contagem ao vivo" },
      { status: 500 }
    );
  }
}
