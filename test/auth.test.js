const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');

async function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-auth-'));
  let time = Date.now();
  const messages = [];
  const env = { AUTH_DB_PATH: path.join(dir, 'auth.sqlite'), AUTH_SECRET: 'test-secret-'.repeat(4), APP_ORIGIN: 'http://127.0.0.1:4173', SMTP_USER: 'sender@example.test', ...options.env };
  const config = { env, now: () => time, sendMail: options.sendMail || (async mail => messages.push(mail)) };
  let server;
  let base;
  async function start() {
    server = createServer(config);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() { await new Promise(resolve => server.close(resolve)); }
  await start();
  t.after(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  async function call(action, data, cookie, origin = env.APP_ORIGIN) {
    const response = await fetch(`${base}/api/auth/${action}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie'), retry: response.headers.get('retry-after') };
  }
  const code = () => messages.at(-1).text.match(/\b\d{6}\b/)[0];
  return { call, messages, code, env, advance: ms => time += ms, restart: async () => { await stop(); await start(); }, url: () => base };
}
const email = 'person@example.test';
const password = 'long secure test password';

test('verified registration, durable login/session, logout, reset and single-use codes', async t => {
  const f = await fixture(t);
  const sent = await f.call('send-code', { email, purpose: 'register' });
  assert.equal(sent.status, 200);
  assert.equal(JSON.stringify(sent.body).includes(f.code()), false);
  const code = f.code();
  assert.equal((await f.call('register', { email, password, code })).status, 200);
  assert.equal((await f.call('register', { email, password, code })).status, 400);
  await f.restart();
  assert.equal((await f.call('login', { email, password: 'incorrect password' })).status, 401);
  const login = await f.call('login', { email: 'PERSON@example.test', password });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/); assert.match(login.cookie, /SameSite=Lax/);
  const cookie = login.cookie.split(';')[0];
  await f.restart();
  assert.equal((await f.call('session', undefined, cookie)).body.user.email, email);
  const db = new DatabaseSync(f.env.AUTH_DB_PATH);
  assert.notEqual(db.prepare('SELECT password FROM users').get().password, password);
  assert.notEqual(db.prepare('SELECT digest FROM sessions').get().digest, cookie.split('=')[1]);
  db.close();
  assert.equal((await f.call('logout', {}, cookie)).status, 200);
  assert.equal((await f.call('session', undefined, cookie)).body.user, null);
  const second = await f.call('login', { email, password });
  f.advance(61000);
  assert.equal((await f.call('send-code', { email, purpose: 'reset' })).status, 200);
  const resetCode = f.code();
  const newPassword = 'another long secure password';
  assert.equal((await f.call('reset-password', { email, password: newPassword, code: resetCode })).status, 200);
  assert.equal((await f.call('session', undefined, second.cookie.split(';')[0])).body.user, null);
  assert.equal((await f.call('reset-password', { email, password, code: resetCode })).status, 400);
  assert.equal((await f.call('login', { email, password })).status, 401);
  assert.equal((await f.call('login', { email, password: newPassword })).status, 200);
});

test('expiry, purpose binding, five wrong attempts and persistent resend limit', async t => {
  const f = await fixture(t);
  await f.call('send-code', { email, purpose: 'register' });
  const code = f.code();
  await f.restart();
  const limited = await f.call('send-code', { email, purpose: 'register' });
  assert.equal(limited.status, 429); assert.ok(Number(limited.retry) > 0);
  assert.equal((await f.call('reset-password', { email, password, code })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await f.call('register', { email, password, code: '000000' })).status, 400);
  assert.equal((await f.call('register', { email, password, code })).status, 400);
  f.advance(16 * 60000);
  await f.call('send-code', { email, purpose: 'register' });
  const expired = f.code();
  f.advance(600001);
  assert.equal((await f.call('register', { email, password, code: expired })).status, 400);
});

test('validation, CSRF, mail failure, missing configuration and secret file isolation', async t => {
  const f = await fixture(t, { sendMail: async () => { throw new Error('sensitive SMTP diagnostic'); } });
  assert.equal((await f.call('login', { email, password }, null, 'https://evil.example')).status, 403);
  assert.equal((await f.call('login', { email: 'bad', password })).status, 400);
  assert.equal((await f.call('register', { email, password: 'short' })).status, 400);
  const failed = await f.call('send-code', { email, purpose: 'register' });
  assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed), /sensitive SMTP/);
  const db = new DatabaseSync(f.env.AUTH_DB_PATH);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM codes').get().n, 0); db.close();
  for (const file of ['/.env', '/auth.js', '/data/auth.sqlite']) assert.equal((await fetch(f.url() + file)).status, 404);
  const missing = await fixture(t, { env: { AUTH_SECRET: '' } });
  assert.equal((await missing.call('send-code', { email, purpose: 'register' })).status, 503);
});

test('concurrent resends send once; account attempts and sessions expire', async t => {
  const f = await fixture(t);
  const results = await Promise.all([1, 2].map(() => f.call('send-code', { email, purpose: 'register' })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
  assert.equal(f.messages.length, 1);
  await f.call('register', { email, password, code: f.code() });
  const login = await f.call('login', { email, password });
  for (let i = 0; i < 8; i++) await f.call('login', { email, password: 'wrong password' });
  assert.equal((await f.call('login', { email, password })).status, 429);
  f.advance(8 * 86400000);
  assert.equal((await f.call('session', undefined, login.cookie.split(';')[0])).body.user, null);
  assert.equal((await f.call('login', { email, password })).status, 200);
});
