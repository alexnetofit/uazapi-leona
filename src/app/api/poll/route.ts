import { NextRequest, NextResponse } from "next/server";
import { getServers, getSnapshotsByNames, batchSaveSnapshots, getWebhookUrl, setLastPoll, saveLog } from "@/lib/kv";
import { buildServerSnapshot } from "@/lib/snapshot";
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
    const nowDate = new Date();
    const brtHour = (nowDate.getUTCHours() - 3 + 24) % 24;
    if (brtHour >= 1 && brtHour < 6) {
      return NextResponse.json({
        message: "Polling pausado entre 1h e 6h (BRT)",
        skipped: true,
      });
    }

    const servers = await getServers();

    if (servers.length === 0) {
      return NextResponse.json({
        message: "Nenhum servidor cadastrado",
        polled: 0,
      });
    }

    const serverNames = servers.map((s) => s.name);
    const [snapshotsMap, webhookUrl] = await Promise.all([
      getSnapshotsByNames(serverNames),
      getWebhookUrl(),
    ]);

    const newSnapshots: ServerSnapshot[] = [];

    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          const previousSnapshot = snapshotsMap.get(server.name) || null;
          const snapshot = await buildServerSnapshot(server);
          newSnapshots.push(snapshot);

          if (snapshot.error) {
            console.error(`Servidor ${server.name} inacessível`);

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
                    timestamp: snapshot.timestamp,
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

            await saveLog({
              id: `${Date.now()}-${server.name}-error`,
              type: "server_error",
              server: server.name,
              message: `Servidor inacessível após 2 tentativas`,
              timestamp: snapshot.timestamp,
              details: {
                last_known_total: previousSnapshot?.totalInstances ?? null,
                last_known_connected: previousSnapshot?.connectedInstances ?? null,
              },
            });

            return { server: server.name, status: "error" as const, alert: true };
          }

          const { totalInstances, connectedInstances, timestamp } = snapshot;
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

              if (webhookUrl) {
                const alert: WebhookAlert = {
                  server: server.name,
                  disconnected_count: droppedCount,
                  disconnected_instances: [],
                  timestamp,
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

              await saveLog({
                id: `${Date.now()}-${server.name}-disconnect`,
                type: "disconnect_alert",
                server: server.name,
                message: `${droppedCount} instâncias desconectaram. Conectadas: ${connectedInstances}/${totalInstances}`,
                timestamp,
                details: {
                  disconnected_count: droppedCount,
                  connected_now: connectedInstances,
                  total_instances: totalInstances,
                },
              });
            }
          }

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

    await Promise.all([
      batchSaveSnapshots(newSnapshots, snapshotsMap),
      setLastPoll(new Date().toISOString()),
    ]);

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
