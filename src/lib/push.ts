import webpush from "web-push";
import { getPushSubscriptions, removePushSubscription } from "./kv";

function setupVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(
    "mailto:admin@uazapi.com",
    publicKey,
    privateKey
  );

  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!setupVapid()) {
    console.warn("VAPID keys não configuradas, push não enviado");
    return;
  }

  const subscriptions = await getPushSubscriptions();

  if (subscriptions.length === 0) return;

  const message = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          message
        );
      } catch (error: unknown) {
        // Se a subscription expirou ou foi revogada, remover
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(sub.endpoint);
          console.log(`Subscription removida (expirada): ${sub.endpoint.slice(0, 50)}...`);
        } else {
          console.error("Erro ao enviar push:", error);
        }
      }
    })
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  console.log(`Push enviado para ${sent}/${subscriptions.length} dispositivos`);
}
