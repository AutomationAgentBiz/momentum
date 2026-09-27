/* Momentum offline cache. Bump CACHE when you ship a new version. */
const CACHE = "momentum-v54";
const FILES = ["./","./index.html","./css/app.css","./css/v53.css","./js/app.js","./js/v53.js","./manifest.webmanifest","./icon-180.png","./icon-192.png","./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Never cache sync — a stale copy of "what's on the other device" is worse
  // than no answer at all.
  if (e.request.url.includes("/.netlify/functions/")) return;
  // version.json must always come from the site, or the app can never find out
  // that it's out of date.
  if (e.request.url.includes("version.json")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

/* ---- push notifications ----
   The page can't schedule anything for later — once it's closed, its timers are
   gone. This is what lets a reminder arrive when Momentum isn't open. */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Momentum", {
    body: d.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: d.tag || "momentum",
    data: { url: d.url || "/" }
  }));
});

/* Tapping it should land you on the right screen, and reuse the window you
   already have open rather than piling up new ones. */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ("focus" in c) { c.navigate ? c.navigate(target) : null; return c.focus(); }
    }
    return clients.openWindow(target);
  }));
});
