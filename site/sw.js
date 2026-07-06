const CACHE = "personal-trainer-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./strength.html",
  "./strength.css",
  "./strength.js",
  "./speed.html",
  "./speed.css",
  "./speed.js",
  "./progress.html",
  "./progress.css",
  "./progress.js",
  "./history.js",
  "./goals.js",
  "./data/snapshot.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/history/") || url.pathname.startsWith("/data/")) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        fetch(event.request)
          .then((response) => {
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cache.match(event.request)),
      ),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
