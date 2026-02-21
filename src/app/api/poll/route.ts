import { NextRequest, NextResponse } from "next/server";
import { getServers, getSnapshot, saveSnapshot, getWebhookUrl, setLastPoll } from "@/lib/kv";
import { fetchServerStatus, fetchAllInstances, isConnected, getInstanceNumber } from "@/lib/uazapi";
import { sendPushToAll } from "@/lib/push";
import { ServerSnapshot, WebhookAlert } from "@/lib/types";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
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
        // 1) Health check leve via /status
        let serverStatus;
        let statusError: unknown = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            serverStatus = await fetchServerStatus(server.name);
            statusError = null;
            break;
          } catch (err) {
            statusError = err;
            console.error(
              `Tentativa ${attempt}/2 /status falhou para ${server.name}:`,
              err
            );
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 3000));
            }
          }
        }

        if (statusError || !serverStatus) {
          console.error(
            `Servidor ${server.name} inacessível após 2 tentativas`
          );

          const webhookUrl = await getWebhookUrl();
          const previousSnapshot = await getSnapshot(server.name);

          await sendPushToAll({
            title: `Servidor ${server.name} inacessível`,
            body: `Não foi possível conectar após 2 tentativas.`,
            tag: `error-${server.name}`,
          });

          if (webhookUrl) {
            try {
              await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  server: server.name,
                  type: "server_error",
                  message: `Servidor ${server.name} inacessível após 2 tentativas`,
                  error: statusError instanceof Error ? statusError.message : String(statusError),
                  timestamp: new Date().toISOString(),
                  last_known_total: previousSnapshot?.totalInstances ?? null,
                  last_known_connected: previousSnapshot?.connectedInstances ?? null,
                }),
              });
            } catch (webhookError) {
              console.error(
                `Erro ao enviar webhook de erro para ${server.name}:`,
                webhookError
              );
            }
          }

          results.push({ server: server.name, status: "error", alert: true });
          continue;
        }

        // 2) Servidor não saudável — alertar sem gastar /instance/all
        if (!serverStatus.isHealthy) {
          const previousSnapshot = await getSnapshot(server.name);

          await sendPushToAll({
            title: `Servidor ${server.name} não saudável`,
            body: `Health check falhou. Conectadas: ${serverStatus.connectedInstances}`,
            tag: `unhealthy-${server.name}`,
          });

          const webhookUrl = await getWebhookUrl();
          if (webhookUrl) {
            try {
              await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  server: server.name,
                  type: "server_unhealthy",
                  message: `Servidor ${server.name} não saudável`,
                  connected_now: serverStatus.connectedInstances,
                  timestamp: new Date().toISOString(),
                  last_known_total: previousSnapshot?.totalInstances ?? null,
                  last_known_connected: previousSnapshot?.connectedInstances ?? null,
                }),
              });
            } catch (webhookError) {
              console.error(
                `Erro ao enviar webhook unhealthy para ${server.name}:`,
                webhookError
              );
            }
          }

          results.push({ server: server.name, status: "unhealthy", alert: true });
          continue;
        }

        // 3) Saudável — /status já trouxe conectadas, agora buscar total via /instance/all
        const connectedInstances = serverStatus.connectedInstances;
        const now = new Date().toISOString();

        let totalInstances = connectedInstances;
        try {
          const instances = await fetchAllInstances(server.name, server.token);
          totalInstances = instances.length;
        } catch (err) {
          console.error(
            `Falha ao buscar /instance/all para ${server.name}, usando connected como total:`,
            err
          );
        }

        const previousSnapshot = await getSnapshot(server.name);
        let alertTriggered = false;

        if (previousSnapshot) {
          const droppedCount =
            previousSnapshot.connectedInstances - connectedInstances;

          if (droppedCount > 20) {
            await sendPushToAll({
              title: `Alerta: ${server.name}`,
              body: `${droppedCount} instâncias desconectaram. Conectadas agora: ${connectedInstances}/${totalInstances}`,
              tag: `disconnect-${server.name}`,
            });

            const webhookUrl = await getWebhookUrl();
            if (webhookUrl) {
              const alert: WebhookAlert = {
                server: server.name,
                disconnected_count: droppedCount,
                disconnected_instances: [],
                timestamp: now,
                total_instances: totalInstances,
                connected_now: connectedInstances,
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

        const newSnapshot: ServerSnapshot = {
          serverName: server.name,
          instances: [],
          totalInstances,
          connectedInstances,
          disconnectedInstances: totalInstances - connectedInstances,
          timestamp: now,
        };

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
        results.push({ server: server.name, status: "error" });
      }
    }

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
