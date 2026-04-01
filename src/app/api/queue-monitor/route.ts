import { NextRequest, NextResponse } from "next/server";
import { getServers, saveQueueData, getWebhookUrl, saveLog, incrementQueueFail, resetQueueFail } from "@/lib/kv";
import { fetchAllInstances, isConnected } from "@/lib/uazapi";
import { sendPushToAll } from "@/lib/push";
import { QueueEntry } from "@/lib/types";

export const maxDuration = 60;

const QUEUE_ALERT_THRESHOLD = 20;
const FETCH_TIMEOUT_MS = 8000;
const CONCURRENCY_PER_SERVER = 20;

type InstanceItem = { server: string; name: string; owner: string; token: string };
type CheckResult =
  | { success: true; entry: QueueEntry | null }
  | { success: false; item: InstanceItem }
  | { skipped: true };

async function checkOneInstance(
  item: InstanceItem,
  checkedAt: string
): Promise<CheckResult> {
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
    if (res.status === 404) return { skipped: true };
    if (!res.ok) return { success: false, item };
    const data = await res.json();
    const q = data.queue || data;
    const pending = q.pending ?? 0;
    if (pending > 0) {
      return {
        success: true,
        entry: {
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
        },
      };
    }
    return { success: true, entry: null };
  } catch {
    clearTimeout(timeout);
    return { success: false, item };
  }
}

async function checkBatchWithRetry(
  items: InstanceItem[],
  concurrency: number,
  checkedAt: string
): Promise<{ entries: QueueEntry[]; checked: number; failed: number; skipped: number }> {
  const entries: QueueEntry[] = [];
  let failed: InstanceItem[] = [];
  let totalChecked = 0;
  let totalSkipped = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((item) => checkOneInstance(item, checkedAt))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        if ("skipped" in r.value) {
          totalSkipped++;
        } else if (r.value.success) {
          totalChecked++;
          if (r.value.entry) entries.push(r.value.entry);
        } else {
          failed.push(r.value.item);
        }
      } else {
        failed.push(batch[j]);
      }
    }
  }

  if (failed.length > 0) {
    const retryItems = [...failed];
    failed = [];

    for (let i = 0; i < retryItems.length; i += concurrency) {
      const batch = retryItems.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((item) => checkOneInstance(item, checkedAt))
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if ("skipped" in r.value) {
            totalSkipped++;
          } else if (r.value.success) {
            totalChecked++;
            if (r.value.entry) entries.push(r.value.entry);
          } else {
            failed.push(r.value.item);
          }
        }
      }
    }
  }

  return { entries, checked: totalChecked, failed: failed.length, skipped: totalSkipped };
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

    const serverQueueResults = await Promise.allSettled(
      servers.map(async (server) => {
        let instances;
        try {
          instances = await fetchAllInstances(server.name, server.token);
        } catch {
          return { entries: [] as QueueEntry[], total: 0, checked: 0, failed: 0, skipped: 0, server: server.name };
        }

        const connected = instances
          .filter((inst) => isConnected(inst) && inst.token)
          .map((inst) => ({
            server: server.name,
            name: inst.name || "",
            owner: inst.owner || "",
            token: inst.token!,
          }));

        const result = await checkBatchWithRetry(connected, CONCURRENCY_PER_SERVER, checkedAt);

        return {
          entries: result.entries,
          total: connected.length,
          checked: result.checked,
          failed: result.failed,
          skipped: result.skipped,
          server: server.name,
        };
      })
    );

    const queueEntries: QueueEntry[] = [];
    let totalInstances = 0;
    let totalChecked = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const serverStats: Record<string, { total: number; checked: number; failed: number }> = {};
    const failedServerNames: string[] = [];
    const okServerNames: string[] = [];

    for (const result of serverQueueResults) {
      if (result.status === "fulfilled") {
        const v = result.value;
        queueEntries.push(...v.entries);
        totalInstances += v.total;
        totalSkipped += v.skipped;
        totalChecked += v.checked;
        totalFailed += v.failed;

        const realFailures = v.failed;
        const failRate = v.total > 0 ? realFailures / v.total : 0;
        if (failRate > 0.5 && realFailures > 10) {
          failedServerNames.push(v.server);
          serverStats[v.server] = { total: v.total, checked: v.checked, failed: v.failed };
        } else {
          okServerNames.push(v.server);
        }
      }
    }

    const failTrackingPromises: Promise<void>[] = [];

    for (const serverName of okServerNames) {
      failTrackingPromises.push(resetQueueFail(serverName));
    }

    for (const serverName of failedServerNames) {
      failTrackingPromises.push(
        (async () => {
          const consecutiveFails = await incrementQueueFail(serverName);
          if (consecutiveFails >= 2) {
            const stats = serverStats[serverName];
            await sendPushToAll({
              title: `Queue monitor: ${serverName} inacessível`,
              body: `Falhou 2x seguidas na verificação de fila. ${stats.failed}/${stats.total} instâncias não verificadas.`,
              tag: `queue-fail-${serverName}`,
            });

            await saveLog({
              id: `${Date.now()}-queue-fail-${serverName}`,
              type: "queue_alert",
              server: serverName,
              message: `Verificação de fila falhou 2x seguidas (${stats.failed}/${stats.total} instâncias)`,
              timestamp: checkedAt,
              details: {
                consecutive_fails: consecutiveFails,
                total: stats.total,
                checked: stats.checked,
                failed: stats.failed,
              },
            });

            await resetQueueFail(serverName);
          }
        })()
      );
    }

    await Promise.allSettled(failTrackingPromises);

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

    if (totalFailed > 0) {
      console.error(`Queue monitor: ${totalFailed}/${totalInstances} instâncias falharam após retry`, serverStats);
    }

    return NextResponse.json({
      message: "Queue monitor concluído",
      totalInstances,
      totalChecked,
      totalFailed,
      totalSkipped,
      withQueue: queueEntries.length,
      alerting: alertEntries.length,
      ...(totalFailed > 0 ? { failedServers: serverStats } : {}),
    });
  } catch (error) {
    console.error("Erro no queue monitor:", error);
    return NextResponse.json(
      { error: "Erro interno no queue monitor" },
      { status: 500 }
    );
  }
}
