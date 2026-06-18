// public/sw.js
// Service Worker — xử lý Web Push notifications cho vSME PWA

const CACHE_NAME = "vsme-v1";

// ─── Install & Activate ────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  // Skip waiting để SW mới active ngay
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Claim clients để SW kiểm soát ngay tất cả tabs
  event.waitUntil(self.clients.claim());
});

// ─── Push Event ──────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "vSME",
      body: event.data.text(),
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: "/notifications" },
    };
  }

  const options = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/favicon.svg",
    badge: payload.badge ?? "/favicon.svg",
    tag: payload.tag ?? "vsme-notification",
    renotify: true,
    data: payload.data ?? {},
    actions: [
      { action: "open", title: "Xem ngay" },
      { action: "dismiss", title: "Bỏ qua" },
    ],
    // Giữ notification cho đến khi user tương tác
    requireInteraction: false,
    // Timestamp
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "vSME", options)
  );
});

// ─── Notification Click ────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url ?? "/notifications";
  const absoluteUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Nếu đã có tab mở cùng domain → focus và điều hướng
        for (const client of clients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(absoluteUrl);
            return;
          }
        }
        // Chưa có tab → mở tab mới
        if (self.clients.openWindow) {
          return self.clients.openWindow(absoluteUrl);
        }
      })
  );
});

// ─── Push Subscription Change ─────────────────────────────────────────────

self.addEventListener("pushsubscriptionchange", (event) => {
  // Subscription tự động refresh (ít xảy ra, nhưng cần xử lý)
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
      })
      .then((newSubscription) => {
        // Gửi subscription mới lên server
        return fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: newSubscription.endpoint,
            keys: {
              p256dh: btoa(
                String.fromCharCode(...new Uint8Array(newSubscription.getKey("p256dh")))
              ),
              auth: btoa(
                String.fromCharCode(...new Uint8Array(newSubscription.getKey("auth")))
              ),
            },
          }),
        });
      })
  );
});
