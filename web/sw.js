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
// - Media files are cache-first and live in a single bucket named by
//   media generation: the last_media_updated timestamp of the current
//   data.json. When the generation moves on, the new bucket starts
//   empty and fills on view / via the offline link — a photo replaced
//   under the same filename therefore shows up fresh, and the old
//   bucket is deleted on activation. There is deliberately no
//   fallback to older buckets: one lookup per file, nothing else.
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
];

// The media generation (last_media_updated of the newest data.json
// this worker has seen). Read lazily from the cached data.json and
// refreshed whenever a network copy of data.json passes through.
let media_gen = null;

// Cache handles are kept open for the worker's lifetime: re-opening a
// bucket for every request measurably slows down image loads.
let main_cache_promise = null;
let gen_cache_promise = null;
let gen_cache_name = null;

const get_main_cache = () => {
  if (!main_cache_promise) {
    main_cache_promise = caches.open(CACHE);
  }
  return main_cache_promise;
};

const media_bucket = () => MEDIA_PREFIX + (media_gen || "unknown");

const get_gen_cache = async () => {
  await ensure_media_gen();
  if (!media_gen) {
    return null;
  }
  if (!gen_cache_promise || gen_cache_name !== media_bucket()) {
    gen_cache_name = media_bucket();
    gen_cache_promise = caches.open(gen_cache_name);
  }
  return gen_cache_promise;
};

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
  const cache = await get_main_cache();
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
      gen_cache_promise = null;
      gen_cache_name = null;
      await ensure_media_gen();
      // Drop media files that older builds stored in the main bucket.
      const main = await get_main_cache();
      const requests = await main.keys();
      await Promise.all(
        requests
          .filter((request) =>
            new URL(request.url).pathname.includes("/data/media/"),
          )
          .map((request) => main.delete(request)),
      );
      // Drop every bucket that is neither the main one nor the current
      // media generation (if the generation is unknown, keep the media
      // buckets rather than risk deleting the current one).
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => {
            if (!key.startsWith("ceramics-") || key === CACHE) {
              return false;
            }
            if (key.startsWith(MEDIA_PREFIX)) {
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

const serve_media = async (request) => {
  const bucket = await get_gen_cache();
  if (!bucket) {
    // Generation unknown (data.json not cached yet): fetch as usual.
    return fetch(request);
  }
  const hit = await bucket.match(request, { ignoreSearch: true });
  if (hit) {
    return hit;
  }
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await bucket.put(request, response.clone());
  }
  return response;
};

const serve_font = async (request) => {
  const cache = await get_main_cache();
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
  const cache = await get_main_cache();
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
  const cache = await get_main_cache();
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
