import { NextRequest, NextResponse } from "next/server";
import { getServers } from "@/lib/kv";
import { fetchAllInstances, getInstanceNumber } from "@/lib/uazapi";
import { SearchResult } from "@/lib/types";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const number = searchParams.get("number");

    if (!number || number.trim().length < 4) {
      return NextResponse.json(
        { error: "Informe pelo menos 4 dígitos para buscar" },
        { status: 400 }
      );
    }

    const searchTerm = number.trim();
    const servers = await getServers();

    if (servers.length === 0) {
      return NextResponse.json(
        { error: "Nenhum servidor cadastrado" },
        { status: 400 }
      );
    }

    // Buscar em cada servidor sequencialmente até encontrar
    for (const server of servers) {
      try {
        const instances = await fetchAllInstances(server.name, server.token);

        for (const instance of instances) {
          const instanceNumber = getInstanceNumber(instance);
          const instanceName = instance.name || "";

          if (
            instanceNumber.includes(searchTerm) ||
            instanceName.includes(searchTerm)
          ) {
            const result: SearchResult = {
              found: true,
              server: server.name,
              instance,
            };
            return NextResponse.json(result);
          }
        }
      } catch (error) {
        console.error(`Erro ao buscar no servidor ${server.name}:`, error);
        // Continuar para o próximo servidor
      }
    }

    const result: SearchResult = { found: false };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Erro na busca:", error);
    return NextResponse.json(
      { error: "Erro ao buscar número" },
      { status: 500 }
    );
  }
}
