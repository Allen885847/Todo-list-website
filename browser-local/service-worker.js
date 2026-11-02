// Replaced by the browser-local build; only public app assets belong here.
const CACHE = '__TODO_CACHE_NAME__';
const FILES = __TODO_PRECACHE_FILES__;
const legacyCache = name => /^todo-local-[a-f0-9]{16}$/.test(name);

function canonicalPath(pathname) {
  if (['/local', '/local/index', '/local/index.html'].includes(pathname)) return '/local/';
  return pathname.replace(/^\/local\/(app|calendar|data)\.html$/, '/local/$1');
}

function navigationSafe(response) {
  // Cache.addAll follows Cloudflare's .html redirects. A cached response with
  // redirected=true cannot be used for Chrome's redirect=manual navigations.
  // A fresh same-origin response also keeps the requested iframe URL/query intact.
  if (!response.ok || response.type === 'opaque' || response.type === 'opaqueredirect') {
    throw new Error('The local workspace asset could not be loaded.');
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async path => {
      const response = await fetch(new URL(path, self.location.origin), {
        credentials: 'same-origin', redirect: 'follow', cache: 'reload',
      });
      if (response.url && new URL(response.url).origin !== self.location.origin) {
        throw new Error('The local workspace must stay on its own origin.');
      }
      await cache.put(path, navigationSafe(response));
    }));
    // Repair the two original caches even while their broken tabs are open.
    // Later, healthy upgrades still wait for existing tabs to close normally.
    if ((await caches.keys()).some(legacyCache)) await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('todo-local-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith('/local/') || url.pathname === '/local/sw.js') return;
  const path = canonicalPath(url.pathname);
  if (!FILES.includes(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(path);
    if (hit) return navigationSafe(hit);
    const response = await fetch(new URL(path, self.location.origin), {
      credentials: 'same-origin', redirect: 'follow',
    });
    if (response.url && new URL(response.url).origin !== self.location.origin) {
      throw new Error('The local workspace must stay on its own origin.');
    }
    return navigationSafe(response);
  })());
});
