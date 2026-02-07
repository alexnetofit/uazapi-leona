import { NextRequest, NextResponse } from "next/server";
import { getServers, getSnapshot, saveSnapshot, getWebhookUrl, setLastPoll } from "@/lib/kv";
import { fetchAllInstances, isConnected, getInstanceNumber } from "@/lib/uazapi";
import { ServerSnapshot, WebhookAlert } from "@/lib/types";

export const maxDuration = 60; // Máximo de 60s para o cron

export async function GET(request: NextRequest) {
  // Proteger endpoint com CRON_SECRET apenas quando configurado
  // Permite chamadas internas (mesmo origin) sem autenticação
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const referer = request.headers.get("referer") || "";
    const host = request.headers.get("host") || "";
    const isInternalCall = referer.includes(host);

    if (!isInternalCall && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  try {
    const servers = await getServers();

    if (servers.length === 0) {
      return NextResponse.json({
        message: "Nenhum servidor cadastrado",
        polled: 0,
      });
    }

    const results: { server: string; status: string; alert?: boolean }[] = [];

    for (const server of servers) {
      try {
        // Buscar instâncias atuais
        const instances = await fetchAllInstances(server.name, server.token);

        const connected = instances.filter(isConnected);
        const now = new Date().toISOString();

        const newSnapshot: ServerSnapshot = {
          serverName: server.name,
          instances,
          totalInstances: instances.length,
          connectedInstances: connected.length,
          disconnectedInstances: instances.length - connected.length,
          timestamp: now,
        };

        // Buscar snapshot anterior para comparação
        const previousSnapshot = await getSnapshot(server.name);

        let alertTriggered = false;

        if (previousSnapshot) {
          // Encontrar instâncias que eram conectadas e agora não são mais
          const previousConnectedIds = new Set(
            previousSnapshot.instances
              .filter(isConnected)
              .map((inst) => inst.id || inst.name)
          );

          const currentConnectedIds = new Set(
            connected.map((inst) => inst.id || inst.name)
          );

          // Instâncias que estavam conectadas e agora desconectaram
          const disconnectedIds: string[] = [];
          for (const id of previousConnectedIds) {
            if (!currentConnectedIds.has(id)) {
              disconnectedIds.push(id);
            }
          }

          if (disconnectedIds.length > 20) {
            // Disparar webhook
            const webhookUrl = await getWebhookUrl();

            if (webhookUrl) {
              // Buscar os números das instâncias desconectadas
              const disconnectedInstances = disconnectedIds.map((id) => {
                const inst = previousSnapshot.instances.find(
                  (i) => (i.id || i.name) === id
                );
                return inst ? getInstanceNumber(inst) : id;
              });

              const alert: WebhookAlert = {
                server: server.name,
                disconnected_count: disconnectedIds.length,
                disconnected_instances: disconnectedInstances,
                timestamp: now,
                total_instances: instances.length,
                connected_now: connected.length,
              };

              try {
                await fetch(webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(alert),
                });
                alertTriggered = true;
              } catch (webhookError) {
                console.error(
                  `Erro ao enviar webhook para ${server.name}:`,
                  webhookError
                );
              }
            }
          }
        }

        // Salvar novo snapshot
        await saveSnapshot(newSnapshot);

        results.push({
          server: server.name,
          status: "ok",
          alert: alertTriggered,
        });
      } catch (serverError) {
        console.error(
          `Erro ao consultar servidor ${server.name}:`,
          serverError
        );
        results.push({
          server: server.name,
          status: "error",
        });
      }
    }

    // Atualizar timestamp do último poll
    await setLastPoll(new Date().toISOString());

    return NextResponse.json({
      message: "Polling concluído",
      polled: results.length,
      results,
    });
  } catch (error) {
    console.error("Erro no polling:", error);
    return NextResponse.json(
      { error: "Erro interno no polling" },
      { status: 500 }
    );
  }
}
