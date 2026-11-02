import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import vm from 'node:vm';
const base = new URL('../dist/local/', import.meta.url);
for (const name of ['app.html', 'index.html', 'calendar.html', 'data.html']) {
  const html = await readFile(new URL(name, base), 'utf8');
  assert.ok(html.indexOf('storage-namespace.js') < html.indexOf('localStorage.getItem') || !html.includes('localStorage.getItem'));
  assert.doesNotMatch(html, /login-ui\.js|auth-stage|local-ai-form/);
}
assert.match(await readFile(new URL('local-data.js', base), 'utf8'), /mode', 'browser-local/);
const shell = await readFile(new URL('app-shell.js', base), 'utf8');
assert.match(shell, /src: "\.\/\?embedded=1"/);
assert.match(shell, /src: "calendar\?embedded=1"/);
assert.match(shell, /src: "data\?embedded=1"/);
const worker = await readFile(new URL('sw.js', base), 'utf8');
const files = JSON.parse(worker.match(/const FILES = (\[[^;]*\]);/)[1]);
for (const pathname of files) {
  assert.ok(pathname.startsWith('/local/'));
  assert.ok(!pathname.includes('/api/'));
  assert.ok(!pathname.endsWith('.html'), 'precache canonical HTML paths, not redirects');
  if (/\.[a-z]+$/i.test(pathname)) await readFile(new URL('.' + pathname, new URL('../dist/', import.meta.url)));
}
// Serve actual HTTP redirects so Response.redirected has its real Fetch value.
const server = createServer((request, response) => {
  if (request.url === '/local/calendar') {
    response.writeHead(307, { Location: '/local/calendar-canonical' }); response.end();
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('cached ' + request.url);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const redirected = await fetch(origin + '/local/calendar');
  assert.equal(redirected.redirected, true, 'fixture must reproduce real redirect metadata');
  const cached = new Map(), listeners = {}, deleted = [];
  let offline = false, network = 0, skipped = 0, claimed = 0;
  const cache = {
    put: async (path, response) => cached.set(path, response.clone()),
    match: async path => cached.get(path)?.clone(),
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['todo-local-fb9d934f10ee2ad3', 'unrelated-cache'],
    delete: async name => deleted.push(name),
  };
  vm.runInNewContext(worker, {
    self: { location: { origin }, clients: { claim: async () => claimed++ }, skipWaiting: async () => skipped++, addEventListener: (name, fn) => listeners[name] = fn },
    caches, URL, Headers, Response,
    fetch: async (...args) => { network++; if (offline) throw new Error('Offline'); return fetch(...args); },
  });
  let installation;
  listeners.install({ waitUntil: promise => installation = promise }); await installation;
  assert.equal(skipped, 1, 'bad legacy cache must be repaired without waiting for all broken tabs to close');
  assert.equal(cached.get('/local/calendar').redirected, false);
  let activation;
  listeners.activate({ waitUntil: promise => activation = promise }); await activation;
  assert.deepEqual(deleted, ['todo-local-fb9d934f10ee2ad3']); assert.equal(claimed, 1);
  offline = true; const before = network;
  for (const pathname of ['/local/index.html?embedded=1', '/local/?embedded=1', '/local/calendar.html?embedded=1', '/local/calendar?embedded=1', '/local/app.html', '/local/data.html?embedded=1']) {
    let result;
    listeners.fetch({ request: { url: origin + pathname, method: 'GET', mode: 'navigate', redirect: 'manual' }, respondWith: promise => result = promise });
    const response = await result;
    assert.equal(response.status, 200, pathname);
    assert.equal(response.redirected, false, 'Chrome must receive a non-redirected navigation response');
    assert.equal(response.url, '', 'response must preserve the requested iframe URL and query');
    assert.match(await response.text(), /cached/);
  }
  assert.equal(network, before, 'task/Calendar navigations must work offline');
  for (const pathname of ['/api/storage', '/api/local-ai/parse-tasks']) {
    let intercepted = false;
    listeners.fetch({ request: new Request(origin + pathname), respondWith: () => intercepted = true });
    assert.equal(intercepted, false);
  }
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('Browser-local cache passed: real redirected-response regression, Chrome manual navigations, canonical frames, offline reloads, safe legacy cache repair, and APIs excluded.');
