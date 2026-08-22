import { NextResponse } from "next/server";
import { readGrowthData } from "@/lib/growth";

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
