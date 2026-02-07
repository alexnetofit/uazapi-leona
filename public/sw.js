// Service Worker para Push Notifications

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: "Gestão UAZAPI",
      body: event.data.text(),
    };
  }

  const title = data.title || "Gestão UAZAPI";
  const options = {
    body: data.body || "Nova notificação",
    icon: "/icons/alert.png",
    badge: "/icons/alert.png",
    tag: data.tag || "uazapi-alert",
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Se já tem uma aba aberta, foca nela
        for (const client of clients) {
          if (client.url.includes(self.location.origin)) {
            return client.focus();
          }
        }
        // Senão, abre uma nova
        return self.clients.openWindow(url);
      })
  );
});
