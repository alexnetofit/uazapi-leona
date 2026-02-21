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

    const results = await Promise.all(
      servers.map(async (server) => {
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

            const [webhookUrl, previousSnapshot] = await Promise.all([
              getWebhookUrl(),
              getSnapshot(server.name),
            ]);

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

            return { server: server.name, status: "error" as const, alert: true };
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

            return { server: server.name, status: "unhealthy" as const, alert: true };
          }

          // 3) Saudável — buscar total via /instance/all em paralelo com snapshot anterior
          const connectedInstances = serverStatus.connectedInstances;
          const now = new Date().toISOString();

          const [instancesResult, previousSnapshot] = await Promise.all([
            fetchAllInstances(server.name, server.token)
              .then((inst) => inst.length)
              .catch((err) => {
                console.error(
                  `Falha ao buscar /instance/all para ${server.name}:`,
                  err
                );
                return connectedInstances;
              }),
            getSnapshot(server.name),
          ]);

          const totalInstances = instancesResult;
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

          return {
            server: server.name,
            status: "ok" as const,
            alert: alertTriggered,
          };
        } catch (serverError) {
          console.error(
            `Erro ao consultar servidor ${server.name}:`,
            serverError
          );
          return { server: server.name, status: "error" as const };
        }
      })
    );

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
