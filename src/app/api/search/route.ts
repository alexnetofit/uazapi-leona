import { NextRequest, NextResponse } from "next/server";
import { getServers } from "@/lib/kv";
import { fetchAllInstances, getInstanceNumber } from "@/lib/uazapi";
import { SearchResult, Instance } from "@/lib/types";
import { getUserRole } from "@/lib/api-auth";

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
    const skipServersParam = searchParams.get("skipServers") || "";
    const skipSet = new Set(
      skipServersParam ? skipServersParam.split(",").map((s) => s.trim()) : []
    );

    const servers = await getServers();

    if (servers.length === 0) {
      return NextResponse.json(
        { error: "Nenhum servidor cadastrado" },
        { status: 400 }
      );
    }

    const filteredServers = servers.filter((s) => !skipSet.has(s.name));

    if (filteredServers.length === 0) {
      const result: SearchResult = { found: false };
      return NextResponse.json(result);
    }

    const role = getUserRole(request);

    const results = await Promise.allSettled(
      filteredServers.map(async (server) => {
        const instances = await fetchAllInstances(server.name, server.token);
        const matches: { server: string; instance: Instance }[] = [];

        for (const instance of instances) {
          const instanceNumber = getInstanceNumber(instance);
          const instanceName = instance.name || "";

          if (
            instanceNumber.includes(searchTerm) ||
            instanceName.includes(searchTerm)
          ) {
            let safeInstance: Partial<Instance> = instance;
            if (role !== "admin") {
              const { token, paircode, qrcode, id, ...rest } = instance;
              safeInstance = rest;
            }
            matches.push({ server: server.name, instance: safeInstance as Instance });
          }
        }

        return matches;
      })
    );

    const allMatches: { server: string; instance: Instance }[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allMatches.push(...result.value);
      }
    }

    if (allMatches.length === 0) {
      return NextResponse.json({ found: false, results: [] });
    }

    return NextResponse.json({
      found: true,
      results: allMatches,
    });
  } catch (error) {
    console.error("Erro na busca:", error);
    return NextResponse.json(
      { error: "Erro ao buscar número" },
      { status: 500 }
    );
  }
}
