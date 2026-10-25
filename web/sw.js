// Service worker: makes the ceramics collection work fully offline.
//
// Registered only for visitors who opted in via the footer "offline"
// link (see collection.js).
//
// Loading strategy:
// - The page shell is served stale-while-revalidate: the cached copy
//   loads instantly and the network copy is fetched in the background
//   for the next visit.
// - data.json is network-first (the page itself renders instantly from
//   its cached copy and swaps in the network copy when the timestamps
//   in it change), falling back to the cache when offline.
// - Media files are cache-first, but bucketed by media generation:
//   the bucket name carries the last_media_updated timestamp of the
//   data.json that described them. When the generation moves on, a
//   cached file from an older bucket is re-fetched while online and
//   served as-is while offline, so a replaced photo eventually shows
//   up without ever leaving a gap.
// - Fonts are cache-first in the main bucket.
//
// The footer "offline" link (see collection.js) fills the caches with
// everything up front, including the 360° videos. Anything that is not
// cached yet is stored the first time it is fetched.

const CACHE = "ceramics-v1"; // keep in sync with OFFLINE_CACHE in collection.js
const MEDIA_PREFIX = "ceramics-media-"; // + last_media_updated timestamp

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

// The media generation (last_media_updated of the newest data.json
// this worker has seen). Read lazily from the cached data.json and
// refreshed whenever a network copy of data.json passes through.
let media_gen = null;

const media_bucket = () => MEDIA_PREFIX + (media_gen || "unknown");

const note_data_json = async (response) => {
  try {
    const parsed = await response.clone().json();
    if (parsed && parsed.last_media_updated) {
      media_gen = parsed.last_media_updated;
    }
  } catch {
    // not parseable: keep the generation we have
  }
};

const ensure_media_gen = async () => {
  if (media_gen) {
    return;
  }
  const cache = await caches.open(CACHE);
  const cached = await cache.match("./data/data.json", { ignoreSearch: true });
  if (cached) {
    await note_data_json(cached);
  }
};

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
    (async () => {
      media_gen = null;
      await ensure_media_gen();
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => {
            if (!key.startsWith("ceramics-") || key === CACHE) {
              return false;
            }
            if (key.startsWith(MEDIA_PREFIX)) {
              // keep the current generation's bucket; if the generation
              // is unknown, keep them all rather than risk the media
              return media_gen !== null && key !== media_bucket();
            }
            return true;
          })
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

const is_media = (url) => url.pathname.includes("/data/media/");
const is_data_json = (url) => url.pathname.endsWith("/data/data.json");
const is_font = (url) =>
  url.hostname === "fonts.googleapis.com" ||
  url.hostname === "fonts.gstatic.com";

// A media file that predates generation buckets (or sits in an older
// one): still servable while offline, revalidated while online.
const find_stale_media = async (request) => {
  const main = await caches.open(CACHE);
  const hit = await main.match(request, { ignoreSearch: true });
  if (hit) {
    return hit;
  }
  const keys = await caches.keys();
  for (const key of keys) {
    if (key.startsWith(MEDIA_PREFIX) && key !== media_bucket()) {
      const bucket = await caches.open(key);
      const stale = await bucket.match(request, { ignoreSearch: true });
      if (stale) {
        return stale;
      }
    }
  }
  return undefined;
};

const serve_media = async (request) => {
  await ensure_media_gen();
  const bucket = await caches.open(media_bucket());
  const hit = await bucket.match(request, { ignoreSearch: true });
  if (hit) {
    return hit;
  }
  const stale = await find_stale_media(request);
  if (stale) {
    try {
      const fresh = await fetch(request);
      if (fresh.ok || fresh.type === "opaque") {
        await bucket.put(request, fresh.clone());
        return fresh;
      }
      return stale;
    } catch {
      return stale;
    }
  }
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await bucket.put(request, response.clone());
  }
  return response;
};

const serve_font = async (request) => {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) {
    return hit;
  }
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
  }
  return response;
};

const serve_data_json = async (request) => {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await note_data_json(response);
    }
    return response;
  } catch (error) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) {
      await note_data_json(hit);
      return hit;
    }
    throw error;
  }
};

// Stale-while-revalidate for the page shell: instant loads, updates
// land on the next visit.
const serve_shell = async (request) => {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });
  if (hit) {
    network.catch(() => {
      // offline: the cached copy was already served
    });
    return hit;
  }
  return network;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Range requests (video streaming) can't be served from the cache
  // reliably; the site fetches videos in full before playing them, so
  // those requests are cached normally.
  if (request.method !== "GET" || request.headers.has("range")) {
    return;
  }
  const url = new URL(request.url);

  if (is_media(url)) {
    event.respondWith(serve_media(request));
  } else if (is_font(url)) {
    event.respondWith(serve_font(request));
  } else if (url.origin === self.location.origin) {
    if (is_data_json(url)) {
      event.respondWith(serve_data_json(request));
    } else {
      event.respondWith(serve_shell(request));
    }
  }
  // all other requests: let the browser handle them as usual
});
