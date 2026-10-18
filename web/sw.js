// Service worker: makes the ceramics collection work fully offline.
//
// The page shell and data.json are network-first, so changes show up
// whenever there is a connection and the last seen version is served
// offline. Media files and fonts are cache-first: they are the bulk of
// the collection and (almost) never change.
//
// The footer "offline" link (see collection.js) fills the cache with
// everything up front, including the 360° videos. Anything that is not
// cached yet is stored the first time it is fetched.

const CACHE = "ceramics-v1"; // keep in sync with OFFLINE_CACHE in collection.js

const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./collection.js",
  "./sort.svg",
  "./favicon.svg",
  "./ceramics.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./data/data.json",
  "./data/media/me.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("ceramics-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const is_cache_first = (url) =>
  url.hostname === "fonts.googleapis.com" ||
  url.hostname === "fonts.gstatic.com" ||
  url.pathname.includes("/data/media/");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Range requests (video streaming) can't be served from the cache
  // reliably; the site fetches videos in full before playing them, so
  // those requests are cached normally.
  if (request.method !== "GET" || request.headers.has("range")) {
    return;
  }
  const url = new URL(request.url);

  if (is_cache_first(url)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok || response.type === "opaque") {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  } else if (url.origin === self.location.origin) {
    // network-first for the page shell and data.json
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true })),
    );
  }
  // all other requests: let the browser handle them as usual
});
