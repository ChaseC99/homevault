// build-sw.mjs supplies the version and file list. Resolve URLs from the worker's
// directory so the same code works at /, /homevault/, or another repository path.
const BASE = new URL('./', self.location.href);
const CACHE_PREFIX = `homevault:${BASE.pathname}:`;
const VERSION = CACHE_PREFIX + '__BUILD_VERSION__';
const FILES = __PRECACHE_FILES__.map((path) => new URL(path, BASE).href);
const INDEX = new URL('index.html', BASE).href;

async function cacheFile(cache, path) {
  const response = await fetch(new Request(path, { cache: 'reload' }));
  if (!response.ok) throw Error(path);
  await cache.put(path, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      try {
        for (const path of FILES) await cacheFile(cache, path);
      } catch (error) {
        await caches.delete(VERSION);
        throw error;
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(CACHE_PREFIX) && key !== VERSION) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== BASE.origin ||
    !url.pathname.startsWith(BASE.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      if (event.request.mode === 'navigate')
        return (await cache.match(INDEX)) || fetch(event.request);
      return (
        (await cache.match(event.request, { ignoreSearch: true, ignoreVary: true })) ||
        fetch(event.request)
      );
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data !== 'CHECK_READY' && event.data?.type !== 'CHECK_READY') return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      let ready = true;
      for (const file of FILES) {
        if (await cache.match(file, { ignoreVary: true })) continue;
        if (event.data?.repair) {
          try {
            await cacheFile(cache, file);
          } catch {
            ready = false;
          }
        } else ready = false;
      }
      event.ports[0]?.postMessage({ ready, version: VERSION });
    })(),
  );
});
