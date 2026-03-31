import { NextRequest, NextResponse } from "next/server";
import { getServers, saveQueueData, getWebhookUrl, saveLog } from "@/lib/kv";
import { fetchAllInstances, isConnected, getInstanceNumber, fetchQueueStatus } from "@/lib/uazapi";
import { sendPushToAll } from "@/lib/push";
import { QueueEntry } from "@/lib/types";

export const maxDuration = 60;

const BATCH_SIZE = 10;
const QUEUE_ALERT_THRESHOLD = 20;

async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }
  return results;
}

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
        message: "Queue monitor pausado entre 1h e 6h (BRT)",
        skipped: true,
      });
    }

    const servers = await getServers();

    if (servers.length === 0) {
      return NextResponse.json({ message: "Nenhum servidor cadastrado", checked: 0 });
    }

    const allConnected: { server: string; instance: { name: string; owner: string; token: string } }[] = [];

    for (const server of servers) {
      try {
        const instances = await fetchAllInstances(server.name, server.token);
        const connected = instances.filter(isConnected);
        for (const inst of connected) {
          if (inst.token) {
            allConnected.push({
              server: server.name,
              instance: {
                name: inst.name || "",
                owner: inst.owner || "",
                token: inst.token,
              },
            });
          }
        }
      } catch (err) {
        console.error(`Erro ao buscar instâncias de ${server.name} para queue monitor:`, err);
      }
    }

    const checkedAt = new Date().toISOString();
    const queueEntries: QueueEntry[] = [];

    await processBatch(allConnected, BATCH_SIZE, async (item) => {
      try {
        const queueStatus = await fetchQueueStatus(item.server, item.instance.token);
        if (queueStatus.pending > 0) {
          queueEntries.push({
            server: item.server,
            instanceName: item.instance.name,
            number: item.instance.owner,
            token: item.instance.token,
            pending: queueStatus.pending,
            status: queueStatus.status,
            processingNow: queueStatus.processingNow,
            sessionReady: queueStatus.sessionReady,
            resetting: queueStatus.resetting,
            checkedAt,
          });
        }
      } catch {
        // Skip instances that fail
      }
    });

    queueEntries.sort((a, b) => b.pending - a.pending);
    await saveQueueData(queueEntries);

    const alertEntries = queueEntries.filter((e) => e.pending > QUEUE_ALERT_THRESHOLD);

    if (alertEntries.length > 0) {
      const topEntries = alertEntries.slice(0, 5);
      const summary = topEntries
        .map((e) => `${e.number} (${e.server}): ${e.pending}`)
        .join(", ");

      await sendPushToAll({
        title: `Filas grandes: ${alertEntries.length} instância(s)`,
        body: summary,
        tag: "queue-alert",
      });

      const webhookUrl = await getWebhookUrl();
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "queue_alert",
              message: `${alertEntries.length} instância(s) com fila > ${QUEUE_ALERT_THRESHOLD}`,
              instances: alertEntries.map((e) => ({
                server: e.server,
                number: e.number,
                pending: e.pending,
                status: e.status,
              })),
              timestamp: checkedAt,
            }),
          });
        } catch (webhookError) {
          console.error("Erro ao enviar webhook de queue alert:", webhookError);
        }
      }

      await saveLog({
        id: `${Date.now()}-queue-alert`,
        type: "queue_alert",
        server: alertEntries.map((e) => e.server).join(", "),
        message: `${alertEntries.length} instância(s) com fila > ${QUEUE_ALERT_THRESHOLD}`,
        timestamp: checkedAt,
        details: {
          total_alerting: alertEntries.length,
          top_instances: summary,
        },
      });
    }

    return NextResponse.json({
      message: "Queue monitor concluído",
      totalChecked: allConnected.length,
      withQueue: queueEntries.length,
      alerting: alertEntries.length,
    });
  } catch (error) {
    console.error("Erro no queue monitor:", error);
    return NextResponse.json(
      { error: "Erro interno no queue monitor" },
      { status: 500 }
    );
  }
}
