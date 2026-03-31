import { NextRequest, NextResponse } from "next/server";
import { getServers, saveQueueData, getWebhookUrl, saveLog } from "@/lib/kv";
import { fetchAllInstances, isConnected } from "@/lib/uazapi";
import { sendPushToAll } from "@/lib/push";
import { QueueEntry } from "@/lib/types";

export const maxDuration = 60;

const BATCH_SIZE = 50;
const QUEUE_ALERT_THRESHOLD = 20;
const FETCH_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkInstanceQueue(
  serverName: string,
  instanceToken: string
): Promise<{ pending: number; status: string; processingNow: boolean; sessionReady: boolean; resetting: boolean } | null> {
  try {
    const res = await fetchWithTimeout(
      `https://${serverName}.uazapi.com/message/async`,
      { method: "GET", headers: { Accept: "application/json", token: instanceToken } },
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      pending: data.pending ?? 0,
      status: data.status ?? "unknown",
      processingNow: data.processingNow ?? false,
      sessionReady: data.sessionReady ?? false,
      resetting: data.resetting ?? false,
    };
  } catch {
    return null;
  }
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

    type ConnectedInstance = { server: string; name: string; owner: string; token: string };
    const allConnected: ConnectedInstance[] = [];

    const serverResults = await Promise.allSettled(
      servers.map(async (server) => {
        const instances = await fetchAllInstances(server.name, server.token);
        return instances.filter(isConnected).map((inst) => ({
          server: server.name,
          name: inst.name || "",
          owner: inst.owner || "",
          token: inst.token || "",
        }));
      })
    );

    for (const result of serverResults) {
      if (result.status === "fulfilled") {
        for (const inst of result.value) {
          if (inst.token) allConnected.push(inst);
        }
      }
    }

    const checkedAt = new Date().toISOString();
    const queueEntries: QueueEntry[] = [];

    for (let i = 0; i < allConnected.length; i += BATCH_SIZE) {
      const batch = allConnected.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const q = await checkInstanceQueue(item.server, item.token);
          if (q && q.pending > 0) {
            queueEntries.push({
              server: item.server,
              instanceName: item.name,
              number: item.owner,
              token: item.token,
              pending: q.pending,
              status: q.status,
              processingNow: q.processingNow,
              sessionReady: q.sessionReady,
              resetting: q.resetting,
              checkedAt,
            });
          }
        })
      );
      void results;
    }

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
