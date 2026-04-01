import { NextRequest, NextResponse } from "next/server";
import { getServers, saveQueueData, getWebhookUrl, saveLog } from "@/lib/kv";
import { fetchAllInstances, isConnected } from "@/lib/uazapi";
import { sendPushToAll } from "@/lib/push";
import { QueueEntry } from "@/lib/types";

export const maxDuration = 60;

const QUEUE_ALERT_THRESHOLD = 20;
const FETCH_TIMEOUT_MS = 8000;
const CONCURRENCY_PER_SERVER = 20;

async function checkQueueBatch(
  items: { server: string; name: string; owner: string; token: string }[],
  checkedAt: string
): Promise<QueueEntry[]> {
  const entries: QueueEntry[] = [];

  const results = await Promise.allSettled(
    items.map(async (item) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(
          `https://${item.server}.uazapi.com/message/async`,
          {
            method: "GET",
            headers: { Accept: "application/json", token: item.token },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        const q = data.queue || data;
        const pending = q.pending ?? 0;
        if (pending > 0) {
          return {
            server: item.server,
            instanceName: item.name,
            number: item.owner,
            token: item.token,
            pending,
            status: q.status ?? "unknown",
            processingNow: q.processingNow ?? false,
            sessionReady: q.sessionReady ?? false,
            resetting: q.resetting ?? false,
            checkedAt,
          } as QueueEntry;
        }
        return null;
      } catch {
        clearTimeout(timeout);
        return null;
      }
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      entries.push(r.value);
    }
  }

  return entries;
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

    const checkedAt = new Date().toISOString();
    let totalChecked = 0;

    const serverQueueResults = await Promise.allSettled(
      servers.map(async (server) => {
        let instances;
        try {
          instances = await fetchAllInstances(server.name, server.token);
        } catch {
          return [] as QueueEntry[];
        }

        const connected = instances
          .filter((inst) => isConnected(inst) && inst.token)
          .map((inst) => ({
            server: server.name,
            name: inst.name || "",
            owner: inst.owner || "",
            token: inst.token!,
          }));

        totalChecked += connected.length;

        const entries: QueueEntry[] = [];
        for (let i = 0; i < connected.length; i += CONCURRENCY_PER_SERVER) {
          const batch = connected.slice(i, i + CONCURRENCY_PER_SERVER);
          const batchEntries = await checkQueueBatch(batch, checkedAt);
          entries.push(...batchEntries);
        }

        return entries;
      })
    );

    const queueEntries: QueueEntry[] = [];
    for (const result of serverQueueResults) {
      if (result.status === "fulfilled") {
        queueEntries.push(...result.value);
      }
    }

    queueEntries.sort((a, b) => b.pending - a.pending);
    await saveQueueData(queueEntries);

    const alertEntries = queueEntries.filter((e) => e.pending > QUEUE_ALERT_THRESHOLD);

    if (alertEntries.length > 0) {
      const topEntries = alertEntries.slice(0, 5);
      const summary = topEntries
        .map((e) => `${e.number} (${e.server}): ${e.pending}`)
        .join(", ");

      const [webhookUrl] = await Promise.all([
        getWebhookUrl(),
        sendPushToAll({
          title: `Filas grandes: ${alertEntries.length} instância(s)`,
          body: summary,
          tag: "queue-alert",
        }),
      ]);

      const webhookPromise = webhookUrl
        ? fetch(webhookUrl, {
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
          }).catch((err) => console.error("Erro webhook queue alert:", err))
        : Promise.resolve();

      await Promise.all([
        webhookPromise,
        saveLog({
          id: `${Date.now()}-queue-alert`,
          type: "queue_alert",
          server: alertEntries.map((e) => e.server).join(", "),
          message: `${alertEntries.length} instância(s) com fila > ${QUEUE_ALERT_THRESHOLD}`,
          timestamp: checkedAt,
          details: {
            total_alerting: alertEntries.length,
            top_instances: summary,
          },
        }),
      ]);
    }

    return NextResponse.json({
      message: "Queue monitor concluído",
      totalChecked,
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
